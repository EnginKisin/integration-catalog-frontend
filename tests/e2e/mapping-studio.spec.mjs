import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const config = (configTarget) => ({ id: configTarget === 'DESTINATION' ? 1 : 2, environmentType: 'DEV', configTarget, url: 'https://example.test', authType: 'NONE', credentialsConfigured: false })
const schema = (id, schemaType, schemaDefinition) => ({ id, schemaType, format: 'JSON', schemaDefinition })
const fieldMapping = (id, sourceSchemaId, targetSchemaId, sourceFieldPath, targetFieldPath) => ({ id, sourceSchemaId, targetSchemaId, sourceFieldPath, targetFieldPath, isAiGenerated: false, aiConfidenceScore: null })
const defaultSchemas = [
  schema(40, 'SOURCE_TO_MW_REQUEST', { order: { id: 'SO-42', currency: 'TRY', total: 1250, net: 1000, customer: { name: 'Örnek' } } }),
  schema(41, 'MW_TO_DEST_REQUEST', { salesOrder: { externalId: 'SO-42', currencyCode: 'TRY', grossAmount: 1250, netAmount: 1000, buyer: { name: 'Örnek' } } }),
  schema(42, 'DEST_TO_MW_RESPONSE', { result: { code: 'OK' } }),
  schema(43, 'MW_TO_SOURCE_RESPONSE', { status: { code: 'OK' } }),
]
const defaultMappings = [fieldMapping(1, 40, 41, 'order.id', 'salesOrder.externalId'), fieldMapping(2, 42, 43, 'result.code', 'status.code')]
const tree = (page, side) => page.getByRole('tree', { name: `${side} alan listesi`, exact: true })
const mappings = (page) => page.getByRole('region', { name: 'Eşleme listesi', exact: true })
const steps = (page) => page.getByRole('navigation', { name: 'Entegrasyon adımları' })
const next = (page) => page.getByRole('button', { name: 'Kaydet ve devam et →', exact: true })
const writes = (state) => state.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/mappings/fields'))
async function openEditor(page, changes = {}) {
  const state = await mockCatalog(page, { configs: [config('DESTINATION'), config('MIDDLEWARE')], schemas: defaultSchemas, mappings: defaultMappings.map((item) => ({ ...item })), ...changes, item: { hasMiddleware: true, middlewareSystemId: 3, isSync: true, ...changes.item } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await steps(page).getByRole('button', { name: /Alan eşleme/ }).click()
  await expect(tree(page, 'Kaynak')).toBeVisible()
  return state
}

test('gerçek isteği eşler, düzenler ve yanıt bağlantısını koruyarak kaydedip yeniden açar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const state = await openEditor(page)
  await expect(page.getByRole('heading', { name: 'ERP → ESB', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ESB → CRM', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kaynak alanları', exact: true })).toContainText('Gelen istek')
  await expect(page.getByRole('region', { name: 'Hedef alanları', exact: true })).toContainText('Giden istek')
  await tree(page, 'Kaynak').getByRole('treeitem', { name: 'order.total, number', exact: true }).click()
  await tree(page, 'Hedef').getByRole('treeitem', { name: 'salesOrder.grossAmount, number', exact: true }).click()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  await page.getByRole('button', { name: 'Geri al', exact: true }).click()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'İleri al', exact: true }).click()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Görselde incelenecek şema çifti', exact: true }).selectOption('DEST_TO_MW_RESPONSE/MW_TO_SOURCE_RESPONSE')
  await expect(page.getByRole('heading', { name: 'CRM → ESB', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ESB → ERP', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kaynak alanları', exact: true })).toContainText('Gelen yanıt')
  await expect(page.getByRole('region', { name: 'Hedef alanları', exact: true })).toContainText('Giden yanıt')
  await expect(tree(page, 'Kaynak').getByRole('treeitem', { name: 'result.code, string, eşlenmiş', exact: true })).toBeVisible()
  await mappings(page).getByRole('button', { name: 'order.total', exact: true }).click()
  await expect(page.getByLabel('Kaynak alan yolu', { exact: true })).toHaveValue('order.total')
  await page.getByLabel('Kaynak alan yolu', { exact: true }).fill('order.net')
  await page.getByLabel('Hedef alan yolu', { exact: true }).fill('salesOrder.netAmount')
  await page.screenshot({ path: testInfo.outputPath('integrated-mapping-studio.png'), fullPage: true })
  await next(page).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Özet ve tamamlama')
  expect(writes(state)).toHaveLength(1)
  expect(writes(state)[0].body).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceSchemaId: 42, targetSchemaId: 43, sourceFieldPath: 'result.code', targetFieldPath: 'status.code' }),
    expect.objectContaining({ sourceSchemaId: 40, targetSchemaId: 41, sourceFieldPath: 'order.net', targetFieldPath: 'salesOrder.netAmount' }),
  ]))
  expect(writes(state)[0].body).toHaveLength(3)
  await steps(page).getByRole('button', { name: /Alan eşleme/ }).click()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  await expect(mappings(page).getByRole('button', { name: 'order.net', exact: true })).toBeVisible()
})

test('uzun kayıtlı şemada 250den sonraki alanları sanal listeden seçip kaydeder', async ({ page }) => {
  const properties = (prefix) => Object.fromEntries(Array.from({ length: 750 }, (_, index) => [`${prefix}${String(index).padStart(4, '0')}`, `Örnek ${index}`]))
  const state = await openEditor(page, { item: { isSync: false }, schemas: [schema(40, 'SOURCE_TO_MW_REQUEST', { attributes: properties('field') }), schema(41, 'MW_TO_DEST_REQUEST', { customFields: properties('property') })], mappings: [] })
  const source = tree(page, 'Kaynak')
  const target = tree(page, 'Hedef')
  expect(await source.getByRole('treeitem').count()).toBeLessThan(60)
  await source.focus()
  await source.press('End')
  await expect(source.getByRole('treeitem', { name: 'attributes.field0749, string', exact: true })).toBeVisible()
  await source.press('Enter')
  await target.focus()
  await target.press('End')
  await target.press('Enter')
  await expect(mappings(page).locator('tbody tr')).toHaveCount(1)
  await next(page).click()
  expect(writes(state)[0].body[0]).toMatchObject({ sourceFieldPath: 'attributes.field0749', targetFieldPath: 'customFields.property0749' })
})

test('sürükleyerek bağlantı ekler; hata sırasında taslağı korur ve kullanıcı eylemiyle tekrar kaydeder', async ({ page }) => {
  const state = await openEditor(page)
  await tree(page, 'Kaynak').getByRole('treeitem', { name: 'order.currency, string', exact: true }).dragTo(tree(page, 'Hedef').getByRole('treeitem', { name: 'salesOrder.currencyCode, string', exact: true }))
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  state.failures.set('POST /integrations/30/mappings/fields', 409)
  await next(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Bu kayıt şu anda güncellenemiyor' })).toBeVisible()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  expect(writes(state)).toHaveLength(1)
  await next(page).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Özet ve tamamlama')
  expect(writes(state)).toHaveLength(2)
})

test('uyumsuz eski eşlemeyi silmeden gösterir ve geçerli çifte taşıyarak düzeltir', async ({ page }) => {
  const state = await openEditor(page, { mappings: [fieldMapping(1, 1000, 2000, 'old.id', 'old.target')] })
  await expect(next(page)).toBeDisabled()
  await mappings(page).getByRole('button', { name: 'old.id', exact: true }).click()
  await page.getByRole('combobox', { name: 'Şema çifti', exact: true }).selectOption('SOURCE_TO_MW_REQUEST/MW_TO_DEST_REQUEST')
  await page.getByLabel('Kaynak alan yolu', { exact: true }).fill('order.id')
  await page.getByLabel('Hedef alan yolu', { exact: true }).fill('salesOrder.externalId')
  await expect(next(page)).toBeEnabled()
  await next(page).click()
  expect(writes(state)[0].body).toMatchObject([{ sourceSchemaId: 40, targetSchemaId: 41, sourceFieldPath: 'order.id', targetFieldPath: 'salesOrder.externalId' }])
})

test('tamamlanmış kayıtta geri alınan değişiklik backend yazması veya DRAFT üretmez', async ({ page }) => {
  const state = await openEditor(page, { item: { status: 'COMPLETED' } })
  await tree(page, 'Kaynak').getByRole('treeitem', { name: 'order.total, number', exact: true }).click()
  await tree(page, 'Hedef').getByRole('treeitem', { name: 'salesOrder.grossAmount, number', exact: true }).click()
  await page.getByRole('button', { name: 'Geri al', exact: true }).click()
  await next(page).click()
  expect(writes(state)).toHaveLength(0)
  expect(state.record.status).toBe('COMPLETED')
})

test('VIEWER yalnızca görüntüler; arama ve indirme çalışır, yazma araçları görünmez', async ({ page }) => {
  const state = await openEditor(page, { role: 'VIEWER' })
  await expect(page.getByLabel('Kaynak alan yolu', { exact: true })).toHaveCount(0)
  await expect(page.locator('.studio-readonly-path').first()).toHaveText('order.id')
  await expect(page.getByRole('button', { name: 'Elle eşleme ekle', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eşlemeyi kaldır', exact: true })).toHaveCount(0)
  await expect(next(page)).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Kaynak alanlarda ara', exact: true }).fill('order.id')
  await expect(tree(page, 'Kaynak').getByRole('treeitem')).toHaveCount(2)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Eşlemeleri indir', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('alan-eslemeleri.json')
  expect(state.calls.filter((call) => call.method !== 'GET')).toHaveLength(0)
})

test('IDOC alan kimliğini ve gerçek örnek değerini yeni panelde korur', async ({ page }) => {
  const node = (name, path, children = []) => ({ name, path, type: children.length ? 'object' : 'string', children })
  const path = '/ORDERS05/IDOC/E1EDK01/BELNR'
  const content = '<ORDERS05><IDOC><E1EDK01><BELNR>42</BELNR></E1EDK01></IDOC></ORDERS05>'
  const fields = [node('ORDERS05', '/ORDERS05', [node('IDOC', '/ORDERS05/IDOC', [node('E1EDK01', '/ORDERS05/IDOC/E1EDK01', [node('BELNR', path)])])])]
  const state = await openEditor(page, { item: { isSync: false, sourcePayloadFormat: 'IDOC' }, schemas: [{ id: 40, schemaType: 'SOURCE_TO_MW_REQUEST', format: 'IDOC', mappingSupported: true, rawContent: content, schemaDefinition: { kind: 'idoc-xml', fields } }, schema(41, 'MW_TO_DEST_REQUEST', { externalId: '42' })], mappings: [] })
  await page.getByRole('searchbox', { name: 'Kaynak alanlarda ara', exact: true }).fill('BELNR')
  await tree(page, 'Kaynak').getByRole('treeitem', { name: `${path}, string`, exact: true }).click()
  await tree(page, 'Hedef').getByRole('treeitem', { name: 'externalId, string', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Eşleme ayrıntıları', exact: true }).locator('.studio-value-box code').first()).toHaveText('42')
  await next(page).click()
  expect(writes(state)[0].body[0]).toMatchObject({ sourceSchemaId: 40, sourceFieldPath: path, targetSchemaId: 41, targetFieldPath: 'externalId' })
})

test('mobilde kayıtlı alanları taşmadan eşler; deneme sayfası ve menü bağlantısı kaldırılmıştır', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openEditor(page)
  await tree(page, 'Kaynak').getByRole('treeitem', { name: 'order.total, number', exact: true }).click()
  await tree(page, 'Hedef').getByRole('treeitem', { name: 'salesOrder.grossAmount, number', exact: true }).click()
  await expect(mappings(page).locator('tbody tr')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('integrated-mapping-mobile.png'), fullPage: true })
  await page.goto('/mapping-preview')
  await expect(page.getByRole('heading', { name: 'Entegrasyonlar', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Eşleme stüdyosu/ })).toHaveCount(0)
  await expect(page.getByText('Örnek senaryo', { exact: true })).toHaveCount(0)
})

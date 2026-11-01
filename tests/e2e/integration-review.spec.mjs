import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const config = (configTarget) => ({ id: configTarget === 'DESTINATION' ? 1 : 2, environmentType: 'DEV', configTarget, url: 'https://example.test/orders', authType: 'API_KEY', credentialsConfigured: true })
const schema = (id, schemaType, schemaDefinition) => ({ id, schemaType, format: 'JSON', schemaDefinition })
const fieldMapping = (id, sourceSchemaId, targetSchemaId, sourceFieldPath, targetFieldPath) => ({ id, sourceSchemaId, targetSchemaId, sourceFieldPath, targetFieldPath, isAiGenerated: false, aiConfidenceScore: null })
const schemas = [
  schema(40, 'SOURCE_TO_MW_REQUEST', { order: { id: 'SO-42', total: 1250 } }),
  schema(41, 'MW_TO_DEST_REQUEST', { salesOrder: { externalId: 'SO-42', amount: 1250 } }),
  schema(42, 'DEST_TO_MW_RESPONSE', { result: { code: 'OK' } }),
  schema(43, 'MW_TO_SOURCE_RESPONSE', { status: { code: 'OK' } }),
]
const mappings = [fieldMapping(1, 40, 41, 'order.id', 'salesOrder.externalId'), fieldMapping(2, 42, 43, 'result.code', 'status.code')]
const steps = (page) => page.getByRole('navigation', { name: 'Entegrasyon adımları' })
const summary = (page) => page.getByRole('region', { name: 'Kaydedilmiş alan eşlemeleri', exact: true })
const complete = (page) => page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true })
const writes = (state) => state.calls.filter((call) => call.method !== 'GET')

async function openReview(page, changes = {}) {
  const state = await mockCatalog(page, { configs: [config('DESTINATION'), config('MIDDLEWARE')], schemas, mappings, ...changes, item: { hasMiddleware: true, middlewareSystemId: 3, isSync: true, description: 'Sipariş ve durum aktarımı', ...changes.item } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await steps(page).getByRole('button', { name: /Özet ve tamamlama/ }).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Özet ve tamamlama')
  return state
}

test('özette istek ve yanıt eşlemelerini değiştirmeden inceler; tamamlamayı ayrı işlemle yapar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const state = await openReview(page)
  await expect(page.getByRole('region', { name: 'Entegrasyon özeti', exact: true })).toContainText('ERP')
  await expect(page.getByRole('region', { name: 'Entegrasyon özeti', exact: true })).toContainText('ESB')
  await expect(page.getByRole('region', { name: 'Entegrasyon özeti', exact: true })).toContainText('CRM')
  await expect(page.getByRole('region', { name: 'Ortam ayarları tablosu', exact: true }).getByRole('row')).toHaveCount(3)
  await expect(summary(page).getByText('Yalnızca görüntüleme', { exact: true })).toBeVisible()
  await expect(summary(page).getByRole('heading', { name: 'ERP → ESB', exact: true })).toBeVisible()
  await expect(summary(page).locator('textarea, [draggable="true"], [contenteditable="true"]')).toHaveCount(0)
  await expect(summary(page).getByLabel('Kaynak alan yolu', { exact: true })).toHaveCount(0)
  await expect(summary(page).getByLabel('Hedef alan yolu', { exact: true })).toHaveCount(0)
  await expect(summary(page).getByRole('button', { name: /Elle eşleme ekle|Eşlemeyi kaldır|Geri al|Tümünü temizle/ })).toHaveCount(0)
  await page.locator('summary').filter({ hasText: 'ERP → ESB (İstek)' }).click()
  await expect(page.locator('.review-sample pre').first()).toContainText('SO-42')
  await summary(page).getByRole('tree', { name: 'Kaynak alan listesi', exact: true }).getByRole('treeitem', { name: 'order.total, number', exact: true }).click()
  await summary(page).getByRole('tree', { name: 'Hedef alan listesi', exact: true }).getByRole('treeitem', { name: 'salesOrder.amount, number', exact: true }).click()
  await expect(summary(page).getByRole('region', { name: 'Eşleme listesi', exact: true }).locator('tbody tr')).toHaveCount(2)
  await summary(page).getByRole('searchbox', { name: 'Kaynak alanlarda ara', exact: true }).fill('order.id')
  await summary(page).getByRole('tree', { name: 'Kaynak alan listesi', exact: true }).getByRole('treeitem', { name: 'order.id, string, eşlenmiş', exact: true }).click()
  await summary(page).getByRole('region', { name: 'Eşleme listesi', exact: true }).getByRole('button', { name: 'result.code', exact: true }).click()
  await expect(summary(page).getByRole('heading', { name: 'CRM → ESB', exact: true })).toBeVisible()
  await expect(summary(page).locator('.studio-readonly-path').first()).toHaveText('result.code')
  await expect(summary(page).locator('.studio-value-box code').first()).toHaveText('OK')
  const downloadPromise = page.waitForEvent('download')
  await summary(page).getByRole('button', { name: 'Eşlemeleri indir', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('alan-eslemeleri.json')
  expect(writes(state)).toHaveLength(0)
  expect(state.mappings).toEqual(mappings)
  await page.screenshot({ path: testInfo.outputPath('review-desktop.png'), fullPage: true })
  await complete(page).click()
  await expect(page.getByRole('button', { name: 'Katalog kaydı tamamlandı', exact: true })).toBeDisabled()
  expect(writes(state).map(({ method, path }) => `${method} ${path}`)).toEqual(['PATCH /integrations/30/complete'])
  expect(state.mappings).toEqual(mappings)
})

test('teknik inceleme onayı tamamlamayı otomatik başlatmaz', async ({ page }) => {
  const state = await openReview(page, { item: { reviewRequired: true } })
  await expect(complete(page)).toBeDisabled()
  const confirm = page.getByRole('button', { name: 'İncelemeyi onayla', exact: true })
  await expect(confirm).toBeDisabled()
  await page.getByRole('region', { name: 'Teknik inceleme onayı', exact: true }).getByRole('checkbox').check()
  await confirm.click()
  await expect(complete(page)).toBeEnabled()
  expect(writes(state).map(({ path }) => path)).toEqual(['/integrations/30/review/confirm'])
  expect(state.record.status).toBe('DRAFT')
  await complete(page).click()
  await expect(page.getByRole('button', { name: 'Katalog kaydı tamamlandı', exact: true })).toBeDisabled()
  expect(writes(state).map(({ path }) => path)).toEqual(['/integrations/30/review/confirm', '/integrations/30/complete'])
})

test('uyumsuz eski bağlantıyı salt okunur gösterir ve tamamlama engelini korur', async ({ page }) => {
  const old = fieldMapping(3, 1000, 2000, 'old.id', 'old.target')
  const state = await openReview(page, { mappings: [old] })
  await expect(complete(page)).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Tamamlanması gereken kontroller', exact: true })).toBeVisible()
  await summary(page).getByRole('button', { name: 'old.id', exact: true }).click()
  await expect(summary(page).locator('.studio-readonly-path').first()).toHaveText('old.id')
  await expect(summary(page).getByRole('alert')).toContainText('Alan eşleme adımını açın')
  expect(state.mappings).toEqual([old])
  expect(writes(state)).toHaveLength(0)
})

test('mobilde özet taşmaz; VIEWER inceleyebilir ve tamamlayamaz', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await openReview(page, { role: 'VIEWER', item: { reviewRequired: true } })
  await expect(summary(page).getByRole('tree', { name: 'Kaynak alan listesi', exact: true })).toBeVisible()
  await summary(page).getByRole('button', { name: 'result.code', exact: true }).click()
  await expect(summary(page).locator('.studio-readonly-path').first()).toHaveText('result.code')
  await expect(complete(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'İncelemeyi onayla', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(writes(state)).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('review-mobile.png'), fullPage: true })
})

test('doğrudan akışta eski eşlemeler bulunsa da eşleme editörü gösterilmez', async ({ page }) => {
  await openReview(page, { item: { hasMiddleware: false, middlewareSystemId: null, isSync: false }, configs: [config('DESTINATION')], schemas: [schema(50, 'SOURCE_TO_DEST_REQUEST', { id: 'SO-42' })] })
  await expect(summary(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Entegrasyon özeti', exact: true })).toContainText('Doğrudan akış')
  await expect(page.getByRole('region', { name: 'Kayıtlı istek ve yanıt örnekleri', exact: true })).toBeVisible()
})

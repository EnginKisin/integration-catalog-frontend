import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mockCatalog } from './mock-api.mjs'

const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
const xml = readFileSync(fixturePath('order.xml'), 'utf8')
const idoc = readFileSync(fixturePath('order.idoc'), 'utf8')
const field = (path, children = [], kind = 'element') => ({ name: path.split('/').at(-1), path, type: children.length ? 'object' : 'string', kind, repeated: false, namespaceUri: '', children })
const xmlTree = { kind: 'xml', fields: [field('/order', [field('/order/@id', [], 'attribute'), field('/order/id'), field('/order/line', [field('/order/line/sku')])])] }
const idocTree = { kind: 'idoc-xml', fields: [field('/ORDERS05', [field('/ORDERS05/IDOC', [field('/ORDERS05/IDOC/E1EDK01', [field('/ORDERS05/IDOC/E1EDK01/BELNR')])])])] }
const xmlTrees = { [xml]: xmlTree, [idoc]: idocTree }
const config = (configTarget = 'DESTINATION') => ({ id: configTarget === 'DESTINATION' ? 1 : 2, environmentType: 'DEV', configTarget, url: 'https://example.test', authType: 'NONE', credentialsConfigured: false })
const next = (page) => page.getByRole('button', { name: 'Kaydet ve devam et →', exact: true })
const steps = (page) => page.getByRole('navigation', { name: 'Entegrasyon adımları' })
const current = (page) => steps(page).locator('[aria-current="step"]')
const writes = (state, suffix) => state.calls.filter((call) => call.method === 'POST' && call.path.endsWith(suffix))
const requestSlot = (page) => page.getByRole('region', { name: 'ERP → CRM (İstek)', exact: true })
async function open(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
}
async function downloadBytes(page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Örnek dosyayı indir', exact: true }).click()
  const download = await pending
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return { bytes: Buffer.concat(chunks), name: download.suggestedFilename() }
}

for (const [format, fileName] of [['JSON', 'order.json'], ['XML', 'order.xml'], ['IDOC', 'order.idoc'], ['CSV', 'order.csv'], ['EXCEL', 'order.xlsx']]) {
  test(`${format} dosyasını yükler, özgün baytları indirir ve eşlemesiz tamamlar`, async ({ page }) => {
    const state = await mockCatalog(page, { item: { sourcePayloadFormat: format, destinationPayloadFormat: format }, configs: [config()], xmlTrees })
    await open(page)
    await expect(current(page)).toContainText('İstek ve yanıt')
    const slot = requestSlot(page)
    if (format !== 'EXCEL') await slot.getByRole('combobox', { name: 'İçerik ekleme yöntemi', exact: true }).selectOption('file')
    await slot.getByLabel(`Örnek dosya (${format})`, { exact: true }).setInputFiles(fixturePath(fileName))
    if (format === 'CSV') await slot.getByRole('combobox', { name: 'CSV ayırıcı', exact: true }).selectOption(';')
    await next(page).click()
    await expect(current(page)).toContainText('Özet ve tamamlama')
    const uploaded = writes(state, '/schemas/upload')
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].body.metadata).toMatchObject({ schemaType: 'SOURCE_TO_DEST_REQUEST', format })
    expect(uploaded[0].body.file.bytes).toEqual(readFileSync(fixturePath(fileName)))
    expect(state.schemas[0].format).toBe(format)
    if (['CSV', 'EXCEL'].includes(format)) await expect(steps(page).getByRole('button', { name: /Alan eşleme/ })).toHaveCount(0)
    await page.locator('summary').filter({ hasText: `ERP → CRM (İstek) · ${format}` }).click()
    const downloaded = await downloadBytes(page)
    expect(downloaded.name).toBe(fileName)
    expect(downloaded.bytes).toEqual(readFileSync(fixturePath(fileName)))
    await expect(page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Katalog kaydı tamamlandı', exact: true })).toBeDisabled()
    expect(writes(state, '/fields')).toHaveLength(0)
  })
}

test('senkron XML isteği ve IDOC yanıtını ham metin olarak ayrı formatlarda kaydeder', async ({ page }) => {
  const state = await mockCatalog(page, { item: { isSync: true, sourcePayloadFormat: 'XML', destinationPayloadFormat: 'IDOC' }, configs: [config()], xmlTrees })
  await open(page)
  await page.getByRole('textbox', { name: 'XML içeriği', exact: true }).fill(xml)
  await page.getByRole('textbox', { name: 'IDOC içeriği', exact: true }).fill(idoc)
  await page.getByRole('textbox', { name: 'Hedef IDOC içeriği', exact: true }).fill(idoc)
  await page.getByRole('textbox', { name: 'Hedef XML içeriği', exact: true }).fill(xml)
  await next(page).click()
  await expect(current(page)).toContainText('Alan eşleme')
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(writes(state, '/schemas').map((call) => call.body)).toEqual([
    { schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'XML', rawContent: xml, targetFormat: 'IDOC', targetRawContent: idoc },
    { schemaType: 'DEST_TO_SOURCE_RESPONSE', format: 'IDOC', rawContent: idoc, targetFormat: 'XML', targetRawContent: xml },
  ])
  await expect(page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true })).toBeEnabled()
})

test('CSV metnini seçenekleriyle kaydeder; CSV → XML ara katman akışında eşleme istemez', async ({ page }) => {
  const state = await mockCatalog(page, { item: { hasMiddleware: true, middlewareSystemId: 3, sourcePayloadFormat: 'CSV', destinationPayloadFormat: 'XML' }, configs: [config(), config('MIDDLEWARE')], xmlTrees })
  await open(page)
  await page.getByRole('textbox', { name: 'CSV içeriği', exact: true }).fill('42;Örnek\n')
  await page.getByRole('combobox', { name: 'CSV ayırıcı', exact: true }).selectOption(';')
  await page.getByRole('checkbox', { name: 'İlk satır başlık', exact: true }).uncheck()
  await page.getByRole('textbox', { name: 'XML içeriği', exact: true }).fill(xml)
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  await expect(steps(page).getByRole('button', { name: /Alan eşleme/ })).toHaveCount(0)
  expect(writes(state, '/schemas')[0].body).toEqual({ schemaType: 'SOURCE_TO_MW_REQUEST', format: 'CSV', rawContent: '42;Örnek\n', csvOptions: { delimiter: ';', hasHeader: false } })
  await expect(page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true })).toBeEnabled()
  expect(writes(state, '/fields')).toHaveLength(0)
})

test('XML → JSON alanlarını backend yollarıyla görselden eşler; boş eşleme de geçerlidir', async ({ page }) => {
  const state = await mockCatalog(page, { item: { hasMiddleware: true, middlewareSystemId: 3, sourcePayloadFormat: 'XML' }, configs: [config(), config('MIDDLEWARE')], xmlTrees })
  await open(page)
  await page.getByRole('textbox', { name: 'XML içeriği', exact: true }).first().fill(xml)
  await page.getByRole('textbox', { name: 'JSON içeriği', exact: true }).first().fill('{"externalId":"42"}')
  await next(page).click()
  await expect(current(page)).toContainText('Alan eşleme')
  await expect(page.getByText('Henüz alan eşlemesi yok. Eşleme eklemeden devam edebilirsiniz.')).toBeVisible()
  await expect(page.getByLabel('Kaynak alan ağacı', { exact: true })).toHaveCount(0)
  await page.getByRole('tree', { name: 'Kaynak alan listesi', exact: true }).getByRole('treeitem', { name: '/order/id, string', exact: true }).click()
  await page.getByRole('tree', { name: 'Hedef alan listesi', exact: true }).getByRole('treeitem', { name: 'externalId, string', exact: true }).click()
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(writes(state, '/fields')[0].body[0]).toMatchObject({ sourceSchemaId: 40, sourceFieldPath: '/order/id', targetSchemaId: 41, targetFieldPath: 'externalId' })
})

test('doğrudan XML akışında kayıtlı eşleme olsa da eşleme adımını göstermez', async ({ page }) => {
  const mappings = [{ id: 1, sourceSchemaId: 40, targetSchemaId: 40, sourceFieldPath: '/order/id', targetFieldPath: '/order/@id', isAiGenerated: false, aiConfidenceScore: null }]
  const state = await mockCatalog(page, { item: { sourcePayloadFormat: 'XML', destinationPayloadFormat: 'XML' }, configs: [config()], schemas: [{ id: 40, schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'XML', mappingSupported: true, rawContent: xml, schemaDefinition: xmlTree }], mappings })
  await open(page)
  await expect(current(page)).toContainText('Özet ve tamamlama')
  await expect(steps(page).getByRole('button')).toHaveCount(4)
  await expect(steps(page).getByRole('button', { name: /Alan eşleme/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mevcut alan eşlemeleri', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Katalog kaydını tamamla', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '← Önceki adım', exact: true }).click()
  await expect(current(page)).toContainText('İstek ve yanıt')
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(writes(state, '/fields')).toHaveLength(0)
  expect(state.mappings).toEqual(mappings)
})

test('413 yükleme hatasında dosya seçimini korur; tekrar deneme kullanıcı eylemiyle yapılır', async ({ page }) => {
  const state = await mockCatalog(page, { item: { sourcePayloadFormat: 'EXCEL' }, configs: [config()] })
  await open(page)
  const input = page.getByLabel('Örnek dosya (EXCEL)', { exact: true })
  await input.setInputFiles(fixturePath('order.xlsx'))
  state.failures.set('POST /integrations/30/mappings/schemas/upload', { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'Content exceeds limit' } })
  await next(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Excel dosyaları en fazla 5 MiB' })).toBeVisible()
  expect(await input.evaluate((element) => element.files[0]?.name)).toBe('order.xlsx')
  expect(writes(state, '/schemas/upload')).toHaveLength(1)
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(writes(state, '/schemas/upload')).toHaveLength(2)
})

test('eşleme çatışmasında XML girdisini ve kayıtlı örneği korur; çözüm yolunu gösterir', async ({ page }) => {
  const original = { id: 40, schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'XML', mappingSupported: true, rawContent: xml, schemaDefinition: xmlTree }
  const state = await mockCatalog(page, { item: { sourcePayloadFormat: 'XML', destinationPayloadFormat: 'XML', status: 'COMPLETED' }, configs: [config()], schemas: [original], mappings: [{ id: 1, sourceSchemaId: 40, targetSchemaId: 40, sourceFieldPath: '/order/id', targetFieldPath: '/order/@id', isAiGenerated: false, aiConfidenceScore: null }] })
  await open(page)
  await steps(page).getByRole('button', { name: /İstek ve yanıt/ }).click()
  const content = page.getByRole('textbox', { name: 'XML içeriği', exact: true })
  await content.fill('<different/>')
  state.failures.set('POST /integrations/30/mappings/schemas', { status: 409, body: { code: 'SCHEMA_MAPPING_CONFLICT', message: 'Existing mapping paths would be removed' } })
  await next(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'ilgili bağlantıları kaldırıp kaydedin' })).toBeVisible()
  await expect(content).toHaveValue('<different/>')
  expect(state.schemas[0]).toEqual(original)
  expect(state.mappings).toHaveLength(1)
  expect(writes(state, '/schemas')).toHaveLength(1)
})

test('kısmi kayıtta başarılı JSONu tekrar göndermez, başarısız Excel dosyasını korur', async ({ page }) => {
  const state = await mockCatalog(page, { item: { isSync: true, destinationPayloadFormat: 'EXCEL' }, configs: [config()] })
  await open(page)
  await page.getByRole('textbox', { name: 'JSON içeriği', exact: true }).fill('{"id":42}')
  const input = page.getByLabel('Örnek dosya (EXCEL)', { exact: true })
  await input.setInputFiles(fixturePath('order.xlsx'))
  state.failures.set('POST /integrations/30/mappings/schemas/upload', { status: 400, body: { code: 'INVALID_EXCEL', message: 'Workbook rejected' } })
  await next(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'şifresiz bir .xls' })).toBeVisible()
  expect(state.schemas).toHaveLength(1)
  expect(writes(state, '/schemas')).toHaveLength(1)
  expect(await input.evaluate((element) => element.files[0]?.name)).toBe('order.xlsx')
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(writes(state, '/schemas')).toHaveLength(1)
  expect(writes(state, '/schemas/upload')).toHaveLength(2)
})

test('yanlış uzantıda istek göndermez; mobil dosya editörü yatay taşmaz', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockCatalog(page, { item: { sourcePayloadFormat: 'EXCEL' }, configs: [config()] })
  await open(page)
  const input = page.getByLabel('Örnek dosya (EXCEL)', { exact: true })
  await input.setInputFiles(fixturePath('order.csv'))
  await next(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'uzantılı dosya seçin' }).first()).toBeVisible()
  expect(writes(state, '/schemas/upload')).toHaveLength(0)
  await input.setInputFiles(fixturePath('order.xlsx'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-payload.png'), fullPage: true })
})

test('VIEWER kayıtlı Excel örneğini indirebilir; yükleme veya kayıt düğmesi görmez', async ({ page }) => {
  const state = await mockCatalog(page, { role: 'VIEWER', item: { sourcePayloadFormat: 'EXCEL' }, configs: [config()], schemas: [{ id: 40, schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'EXCEL', mappingSupported: false, schemaDefinition: {}, fileName: 'order.xlsx', fileSize: readFileSync(fixturePath('order.xlsx')).length, sampleDownloadUrl: '/api/v1/integrations/30/mappings/schemas/40/sample' }] })
  state.sampleFiles.set(40, { name: 'order.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: readFileSync(fixturePath('order.xlsx')) })
  await open(page)
  await steps(page).getByRole('button', { name: /İstek ve yanıt/ }).click()
  await page.locator('summary').filter({ hasText: 'ERP → CRM (İstek) · EXCEL' }).click()
  expect((await downloadBytes(page)).bytes).toEqual(readFileSync(fixturePath('order.xlsx')))
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  await expect(next(page)).toHaveCount(0)
  expect(writes(state, '/schemas/upload')).toHaveLength(0)
})

test('yüklenmiş XMLi metinle değiştirince aynı IDyi korur ve eski dosya bilgisini kaldırır', async ({ page }) => {
  const state = await mockCatalog(page, { item: { sourcePayloadFormat: 'XML', destinationPayloadFormat: 'XML' }, configs: [config()], xmlTrees })
  await open(page)
  const slot = requestSlot(page)
  await slot.getByRole('combobox', { name: 'İçerik ekleme yöntemi', exact: true }).selectOption('file')
  await slot.getByLabel('Örnek dosya (XML)', { exact: true }).setInputFiles(fixturePath('order.xml'))
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  const id = state.schemas[0].id
  await steps(page).getByRole('button', { name: /İstek ve yanıt/ }).click()
  await expect(page.getByRole('button', { name: 'Örnek dosyayı indir', exact: true })).toBeVisible()
  const replacement = xml.replace('<id>42</id>', '<id>43</id>')
  xmlTrees[replacement] = xmlTree
  await page.getByRole('textbox', { name: 'XML içeriği', exact: true }).fill(replacement)
  await next(page).click()
  await expect(current(page)).toContainText('Özet ve tamamlama')
  expect(state.schemas).toHaveLength(1)
  expect(state.schemas[0].id).toBe(id)
  expect(state.schemas[0].rawContent).toBe(replacement)
  expect(state.schemas[0].fileName).toBeUndefined()
  await page.locator('summary').filter({ hasText: 'ERP → CRM (İstek) · XML' }).click()
  await expect(page.getByRole('button', { name: 'Örnek dosyayı indir', exact: true })).toHaveCount(0)
})

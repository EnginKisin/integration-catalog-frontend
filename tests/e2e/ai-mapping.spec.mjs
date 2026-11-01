import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const steps = (page) => page.getByRole('navigation', { name: 'Entegrasyon adımları' })
const assistant = (page) => page.getByRole('region', { name: 'AI eşleme asistanı', exact: true })
const manual = (page) => page.getByRole('region', { name: 'Eşleme listesi', exact: true })
const next = (page) => page.getByRole('button', { name: 'Kaydet ve devam et →', exact: true })
const pathFor = (format, key, tag) => format === 'JSON' ? `/${key}` : format === 'XML' ? `/${tag}/${key}` : `/${tag}/IDOC/${key}`
function schema(format, id, schemaType, tag, data) {
  if (format === 'JSON') return { id, schemaType, format, schemaDefinition: data, samplePayload: data }
  const prefix = format === 'XML' ? `/${tag}` : `/${tag}/IDOC`
  const body = Object.entries(data).map(([key, value]) => `<${key}>${value}</${key}>`).join('')
  return { id, schemaType, format, rawContent: format === 'XML' ? `<${tag}>${body}</${tag}>` : `<${tag}><IDOC>${body}</IDOC></${tag}>`, schemaDefinition: { kind: format === 'XML' ? 'xml' : 'idoc-xml', fields: Object.keys(data).map((key) => ({ path: `${prefix}/${key}`, name: key, type: 'unknown' })) } }
}
async function openAi(page, { direct = false, response = false, sourceFormat = 'JSON', targetFormat = 'JSON', role = 'ADMIN', queued = false, enabled = true } = {}) {
  const sourceType = response ? direct ? 'DEST_TO_SOURCE_RESPONSE' : 'DEST_TO_MW_RESPONSE' : direct ? 'SOURCE_TO_DEST_REQUEST' : 'SOURCE_TO_MW_REQUEST'
  const targetType = response ? direct ? 'DEST_TO_SOURCE_RESPONSE' : 'MW_TO_SOURCE_RESPONSE' : direct ? 'SOURCE_TO_DEST_REQUEST' : 'MW_TO_DEST_REQUEST'
  const source = schema(sourceFormat, 40, sourceType, 'Source', { customerCode: '000123', fullName: 'Deniz', email: 'demo@example.test', manualCode: 'M1' })
  const target = schema(targetFormat, direct ? 40 : 41, targetType, 'Target', { clientId: '000123', displayName: 'Deniz', email: 'demo@example.test', manualId: 'M1' })
  const schemas = direct ? [{ ...source, targetFormat, targetSchemaDefinition: target.schemaDefinition, targetSamplePayload: target.samplePayload, targetRawContent: target.rawContent }] : [source, target]
  const preserved = { id: 80, sourceSchemaId: source.id, targetSchemaId: target.id, sourceFieldPath: pathFor(sourceFormat, 'email', 'Source'), targetFieldPath: pathFor(targetFormat, 'email', 'Target'), isAiGenerated: false, aiConfidenceScore: null, origin: 'MANUAL' }
  const config = (configTarget) => ({ environmentType: 'DEV', configTarget, authType: 'NONE', credentialsConfigured: false, url: 'https://example.test' })
  const state = await mockCatalog(page, { role, item: { hasMiddleware: !direct, middlewareSystemId: direct ? null : 3, sourcePayloadFormat: response ? targetFormat : sourceFormat, destinationPayloadFormat: response ? sourceFormat : targetFormat }, configs: [config('DESTINATION'), ...(!direct ? [config('MIDDLEWARE')] : [])], schemas, mappings: [{ ...preserved }] })
  const ai = { calls: [], jobs: new Map(), revision: 1, queued, enabled, pollStatuses: ['RUNNING', 'SUCCEEDED'], failedCode: null, stale: false, empty: false, startFailure: null, appendFailure: null, contextFailure: false, resultFailure: false, receipts: new Map() }
  state.ai = ai
  const revision = () => `revision-${ai.revision}`
  const suggestions = () => [
    { suggestionId: 's1', sourceSchemaId: source.id, targetSchemaId: target.id, sourceFieldPath: pathFor(sourceFormat, 'customerCode', 'Source'), targetFieldPath: pathFor(targetFormat, 'clientId', 'Target'), confidence: 'HIGH', reason: 'İki alan aynı müşteri kodunu temsil ediyor.' },
    { suggestionId: 's2', sourceSchemaId: source.id, targetSchemaId: target.id, sourceFieldPath: pathFor(sourceFormat, 'fullName', 'Source'), targetFieldPath: pathFor(targetFormat, 'displayName', 'Target'), confidence: 'MEDIUM', reason: 'İsim alanları benzer amaç taşıyor.' },
  ]
  await page.route(/\/api\/v1\/integrations\/30\/mappings\/(context|ai\/.*|fields\/append)$/, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.method() === 'POST' ? request.postDataJSON() : undefined
    const key = request.headers()['idempotency-key']
    ai.calls.push({ path, method: request.method(), body, key, headers: request.headers() })
    const json = (value, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/context')) {
      if (ai.contextFailure) { ai.contextFailure = false; return json({ message: 'Unavailable' }, 503) }
      return json({ contextRevision: revision(), schemas: state.schemas, mappings: state.mappings })
    }
    if (path.endsWith('/capabilities')) return json({ enabled: ai.enabled, available: ai.enabled, provider: 'ollama', model: 'local-model', supportedFormats: ['JSON', 'XML', 'IDOC'], maxFieldsPerSide: 100, code: ai.enabled ? 'READY' : 'AI_DISABLED' })
    if (path.endsWith('/ai/jobs') && request.method() === 'POST') {
      if (!key) return json({ code: 'MISSING_REQUEST_HEADER', message: 'Key required' }, 400)
      if (!ai.jobs.has(key)) ai.jobs.set(key, { input: body, jobId: `job-${ai.jobs.size + 1}`, status: ai.queued ? 'QUEUED' : ai.failedCode ? 'FAILED' : 'SUCCEEDED', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), pollAfterMs: 1, errorCode: ai.failedCode })
      const entry = ai.jobs.get(key)
      if (ai.startFailure) {
        const failure = ai.startFailure; ai.startFailure = null
        return failure === 'network' ? route.abort('failed') : json({ message: 'AI isteği reddedildi.', code: failure.code }, failure.status)
      }
      return json(entry, 202)
    }
    if (/\/ai\/jobs\/[^/]+$/.test(path)) {
      const entry = [...ai.jobs.values()].find((job) => path.endsWith(`/${job.jobId}`))
      entry.status = ai.failedCode ? 'FAILED' : ai.pollStatuses.shift() ?? 'SUCCEEDED'
      entry.errorCode = entry.status === 'EXPIRED' ? 'AI_RESULT_EXPIRED' : ai.failedCode
      return json(entry)
    }
    if (path.endsWith('/result')) {
      if (ai.resultFailure) { ai.resultFailure = false; return json({ message: 'Unavailable' }, 503) }
      const entry = [...ai.jobs.values()].find((job) => path.endsWith(`/${job.jobId}/result`))
      return json({ jobId: entry.jobId, contextRevision: entry.input.expectedContextRevision, stale: ai.stale, provider: 'ollama', model: 'local-model', suggestions: ai.empty ? [] : suggestions(), unmatchedSourceFields: [{ fieldPath: pathFor(sourceFormat, 'manualCode', 'Source'), code: 'AMBIGUOUS', reason: 'Bağlam yeterli değil; manuel olarak değerlendirin.' }], unmatchedTargetFields: [], warnings: ['Öneriler veri dönüşümü çalıştırmaz.'] })
    }
    if (path.endsWith('/fields/append')) {
      if (ai.appendFailure) { const failure = ai.appendFailure; ai.appendFailure = null; return json({ message: 'Ekleme reddedildi.', code: failure }, 409) }
      if (ai.receipts.has(key)) return json(ai.receipts.get(key))
      if (body.expectedContextRevision !== revision()) return json({ code: 'CONTEXT_CHANGED', message: 'Context changed' }, 409)
      const added = body.mappings.map((item, index) => {
        const original = suggestions().find((suggestion) => suggestion.suggestionId === item.suggestionId)
        const unchanged = original.sourceFieldPath === item.sourceFieldPath && original.targetFieldPath === item.targetFieldPath
        return { ...item, id: Math.max(...state.mappings.map((mapping) => mapping.id)) + index + 1, isAiGenerated: unchanged, aiConfidenceScore: null, origin: unchanged ? 'AI_ACCEPTED' : 'AI_EDITED', aiJobId: body.aiJobId, aiSuggestionId: item.suggestionId }
      })
      state.mappings.push(...added); state.record.status = 'DRAFT'; ai.revision++
      const receipt = { contextRevision: revision(), addedMappings: added }
      ai.receipts.set(key, receipt)
      return json(receipt)
    }
    return json({ message: `Unexpected AI request ${path}` }, 500)
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await steps(page).getByRole('button', { name: /Alan eşleme/ }).click()
  return { state, ai, preserved, source, target }
}

for (const direct of [false, true]) {
  test(`${direct ? 'doğrudan' : 'ara katmanlı'} yanıt akışında ters yönün IDOC → XML çiftini korur`, async ({ page }) => {
    const { ai, state } = await openAi(page, { direct, response: true, sourceFormat: 'IDOC', targetFormat: 'XML' })
    await generate(page)
    await assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true }).click()
    await expect(assistant(page).getByText('2 öneri mevcut bağlantılar korunarak eklendi.', { exact: true })).toBeVisible()
    expect(appends(ai)[0].body.mappings[0]).toMatchObject({ sourceFieldPath: '/Source/IDOC/customerCode', targetFieldPath: '/Target/clientId' })
    expect(state.schemas[0].schemaType).toBe(direct ? 'DEST_TO_SOURCE_RESPONSE' : 'DEST_TO_MW_RESPONSE')
  })
}

test('sonuç okuma hatasında aynı işi sorgular; bağlam okuma hatasını eski iş anahtarıyla tekrar etmez', async ({ page }) => {
  const { ai } = await openAi(page)
  ai.resultFailure = true
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('button', { name: 'Durumu yeniden sorgula', exact: true })).toBeVisible()
  await assistant(page).getByRole('button', { name: 'Durumu yeniden sorgula', exact: true }).click()
  await expect(assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })).toBeVisible()
  expect(ai.jobs.size).toBe(1)
  await assistant(page).getByRole('button', { name: 'Önerileri kapat', exact: true }).click()
  ai.contextFailure = true
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toBeVisible()
  expect(ai.jobs.size).toBe(1)
  await generate(page)
  expect(ai.jobs.size).toBe(2)
})

test('doğrudan hedef JSON örneğini ekrandan kaydeder ve eşleme adımını açar', async ({ page }) => {
  const source = schema('JSON', 40, 'SOURCE_TO_DEST_REQUEST', 'Source', { customerCode: '000123' })
  const state = await mockCatalog(page, { item: {}, schemas: [source], configs: [{ environmentType: 'DEV', configTarget: 'DESTINATION', authType: 'NONE', credentialsConfigured: false, url: 'https://example.test' }] })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await steps(page).getByRole('button', { name: /İstek ve yanıt/ }).click()
  await page.getByRole('checkbox', { name: 'Hedef örneği tanımla · CRM', exact: true }).check()
  await page.getByRole('textbox', { name: 'Hedef JSON içeriği', exact: true }).fill('{"clientId":"000123"}')
  await next(page).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Alan eşleme')
  expect(state.schemas[0]).toMatchObject({ id: 40, targetFormat: 'JSON', targetSamplePayload: { clientId: '000123' } })
  expect(state.calls.find((call) => call.method === 'POST' && call.path.endsWith('/mappings/schemas')).body.samplePayload).toEqual(source.samplePayload)
  await expect(page.getByRole('tree', { name: 'Hedef alan listesi', exact: true }).getByRole('treeitem', { name: 'clientId, string', exact: true })).toBeVisible()
})

test('kaynak dosya ve bağımsız XML hedefini tek yükleme isteğinde kaydeder', async ({ page }) => {
  const target = schema('XML', 40, 'SOURCE_TO_DEST_REQUEST', 'Target', { clientId: '000123' })
  const state = await mockCatalog(page, { item: { destinationPayloadFormat: 'XML' }, configs: [{ environmentType: 'DEV', configTarget: 'DESTINATION', authType: 'NONE', credentialsConfigured: false, url: 'https://example.test' }], xmlTrees: { [target.rawContent]: target.schemaDefinition } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await page.getByRole('combobox', { name: 'İçerik ekleme yöntemi', exact: true }).selectOption('file')
  await page.getByLabel('Örnek dosya (JSON)', { exact: true }).setInputFiles({ name: 'source.json', mimeType: 'application/json', buffer: Buffer.from('{"customerCode":"000123"}') })
  await page.getByRole('textbox', { name: 'Hedef XML içeriği', exact: true }).fill(target.rawContent)
  await next(page).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Alan eşleme')
  const writes = state.calls.filter((call) => call.method === 'POST' && call.path.includes('/schemas'))
  expect(writes).toHaveLength(1)
  expect(writes[0].body.metadata).toEqual({ schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'JSON', targetFormat: 'XML', targetRawContent: target.rawContent })
  expect(state.schemas[0].targetSchemaDefinition).toEqual(target.schemaDefinition)
})
async function generate(page) {
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })).toBeVisible()
}
const appends = (ai) => ai.calls.filter((call) => call.path.endsWith('/fields/append'))

test('işi izler; öneriyi düzenleyip kaldırır ve yalnızca seçileni mevcut IDler korunarak ekler', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const { ai, state, preserved } = await openAi(page, { queued: true })
  await expect(assistant(page).getByLabel('Örnek değerleri de kullan', { exact: true })).toHaveCount(0)
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByText('İşlem sırada', { exact: true })).toBeVisible()
  await expect(assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })).toBeVisible()
  expect(state.mappings).toEqual([preserved])
  expect(appends(ai)).toHaveLength(0)
  expect(ai.calls.find((call) => call.method === 'POST').body.options).toEqual({ useSampleValues: true })
  const first = assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })
  await first.getByLabel('Önerilen hedef alan', { exact: true }).fill('/manualId')
  await expect(first.getByText('Düzenlendi', { exact: true })).toBeVisible()
  await assistant(page).getByRole('article', { name: 'AI önerisi 2', exact: true }).getByRole('button', { name: 'Öneriyi kaldır', exact: true }).click()
  await assistant(page).locator('summary').click()
  await expect(assistant(page)).toContainText('Birden fazla olası eşleşme var. Hedef alanı manuel seçin.')
  await expect(next(page)).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('ai-suggestions-desktop.png'), fullPage: true })
  await assistant(page).getByRole('button', { name: 'Seçilen 1 öneriyi ekle', exact: true }).click()
  await expect(assistant(page).getByText('1 öneri mevcut bağlantılar korunarak eklendi.', { exact: true })).toBeVisible()
  expect(appends(ai)).toHaveLength(1)
  expect(appends(ai)[0].body.mappings).toEqual([{ suggestionId: 's1', sourceSchemaId: 40, targetSchemaId: 41, sourceFieldPath: '/customerCode', targetFieldPath: '/manualId' }])
  expect(appends(ai)[0].headers['x-csrf-token']).toBe('e2e-only')
  expect(state.mappings[0]).toEqual(preserved)
  expect(state.mappings[1]).toMatchObject({ origin: 'AI_EDITED', isAiGenerated: false })
  expect(state.calls.some((call) => call.method === 'POST' && call.path.endsWith('/mappings/fields'))).toBe(false)
  await expect(manual(page).locator('tbody tr')).toHaveCount(2)
  await expect(next(page)).toBeEnabled()
})

test('kaydedilmemiş manuel bağlantıyı korur; AI eklemesi geri alma geçmişinden silinmez', async ({ page }) => {
  const { ai, state, preserved } = await openAi(page)
  await page.getByRole('button', { name: 'Elle eşleme ekle', exact: true }).click()
  await page.getByLabel('Kaynak alan yolu', { exact: true }).fill('manualCode')
  await page.getByLabel('Hedef alan yolu', { exact: true }).fill('manualId')
  await generate(page)
  expect(ai.calls.find((call) => call.method === 'POST').body.protectedMappings).toEqual([{ sourceSchemaId: 40, targetSchemaId: 41, sourceFieldPath: '/manualCode', targetFieldPath: '/manualId' }])
  await assistant(page).getByRole('article', { name: 'AI önerisi 2', exact: true }).getByRole('button', { name: 'Öneriyi kaldır', exact: true }).click()
  await assistant(page).getByRole('button', { name: 'Seçilen 1 öneriyi ekle', exact: true }).click()
  await expect(manual(page).locator('tbody tr')).toHaveCount(3)
  await expect(manual(page).getByRole('button', { name: 'manualCode', exact: true })).toBeVisible()
  expect(state.mappings[0]).toEqual(preserved)
  expect(state.mappings).toHaveLength(2)
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: 'Geri al', exact: true }).click()
  await expect(manual(page).locator('tbody tr')).toHaveCount(2)
  await expect(manual(page).getByRole('button', { name: 'customerCode', exact: true })).toBeVisible()
  expect(appends(ai)).toHaveLength(1)
})

test('belirsiz iş oluşturmayı aynı anahtar ve gövdeyle kullanıcı isteği üzerine yeniden dener', async ({ page }) => {
  const { ai } = await openAi(page)
  ai.startFailure = 'network'
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toContainText('İşlem isteğinin sonucu doğrulanamadı')
  expect(ai.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  await assistant(page).getByRole('button', { name: 'Aynı isteği yeniden dene', exact: true }).click()
  await expect(assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })).toBeVisible()
  const attempts = ai.calls.filter((call) => call.method === 'POST')
  expect(attempts[0].key).toBe(attempts[1].key)
  expect(attempts[0].body).toEqual(attempts[1].body)
  expect(ai.jobs.size).toBe(1)
})

test('AI kapalıyken manuel eşleme ve kaydetme kullanılabilir', async ({ page }) => {
  const { state, ai } = await openAi(page, { enabled: false })
  await expect(assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Elle eşleme ekle', exact: true }).click()
  await page.getByLabel('Kaynak alan yolu', { exact: true }).fill('manualCode')
  await page.getByLabel('Hedef alan yolu', { exact: true }).fill('manualId')
  await next(page).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Özet ve tamamlama')
  expect(state.mappings).toHaveLength(2)
  expect(ai.calls.some((call) => call.method === 'POST')).toBe(false)
})

test('EXPIRED iş Türkçe açıklanır ve sonuç isteği gönderilmez', async ({ page }) => {
  const { ai } = await openAi(page, { queued: true })
  ai.pollStatuses = ['EXPIRED']
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toContainText('Önerilerin süresi doldu.')
  expect(ai.calls.filter((call) => /\/ai\/jobs\/[^/]+$/.test(call.path) && call.method === 'GET')).toHaveLength(1)
  expect(ai.calls.filter((call) => call.path.endsWith('/result'))).toHaveLength(0)
  await expect(manual(page)).toBeVisible()
})

test('AI_CONTENT_BLOCKED hatası Türkçe gösterilir; manuel eşleme açık kalır', async ({ page }) => {
  const { ai } = await openAi(page)
  ai.failedCode = 'AI_CONTENT_BLOCKED'
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toContainText('AI servisi içeriği işleyemedi.')
  await expect(manual(page)).toBeVisible()
})

test('FAILED işi manuel editörü engellemez; sıfır öneri ve eski sonuç ayrı gösterilir', async ({ page }) => {
  const { ai } = await openAi(page)
  ai.failedCode = 'AI_TIMEOUT'
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toContainText('zaman aşımına uğradı')
  await expect(page.getByRole('button', { name: 'Elle eşleme ekle', exact: true })).toBeEnabled()
  ai.failedCode = null; ai.empty = true
  await assistant(page).getByRole('button', { name: 'AI ile eşleştir', exact: true }).click()
  await expect(assistant(page).getByText('Güvenilir bir eşleşme bulunamadı', { exact: true })).toBeVisible()
  expect(appends(ai)).toHaveLength(0)
  ai.empty = false; ai.stale = true
  await assistant(page).getByRole('button', { name: 'Yeni öneri oluştur', exact: true }).click()
  await expect(assistant(page).getByText(/Bu öneriler güncel değil/)).toBeVisible()
  await expect(assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true })).toBeDisabled()
})

test('çakışan hedefi engeller; eski bağlam reddinde önerileri sessizce kaydetmez', async ({ page }) => {
  const { ai, state, preserved } = await openAi(page)
  await generate(page)
  const first = assistant(page).getByRole('article', { name: 'AI önerisi 1', exact: true })
  await first.getByLabel('Önerilen hedef alan', { exact: true }).fill('/email')
  await expect(assistant(page)).toContainText('Bu hedef alan için zaten bir bağlantı var.')
  await expect(assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true })).toBeDisabled()
  await first.getByLabel('Önerilen hedef alan', { exact: true }).fill('/clientId')
  ai.appendFailure = 'CONTEXT_CHANGED'
  await assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true }).click()
  await expect(assistant(page).getByRole('alert')).toContainText('Güncel bilgilerle yeni öneri oluşturun.')
  await expect(assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true })).toBeDisabled()
  expect(appends(ai)).toHaveLength(1)
  expect(state.mappings).toEqual([preserved])
})

test('mobil öneriler taşmaz; VIEWER öneri oluşturamaz', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { ai } = await openAi(page)
  await generate(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ai-suggestions-mobile.png'), fullPage: true })
  await page.unrouteAll()
  await openAi(page, { role: 'VIEWER' })
  await expect(assistant(page)).toHaveCount(0)
  expect(appends(ai)).toHaveLength(0)
})

for (const sourceFormat of ['JSON', 'XML', 'IDOC']) for (const targetFormat of ['JSON', 'XML', 'IDOC']) {
  test(`doğrudan ${sourceFormat} → ${targetFormat} önerisini bağımsız hedefe ekler`, async ({ page }) => {
    const { ai, state, preserved } = await openAi(page, { direct: true, sourceFormat, targetFormat })
    await generate(page)
    await assistant(page).getByRole('button', { name: 'Seçilen 2 öneriyi ekle', exact: true }).click()
    await expect(assistant(page).getByText('2 öneri mevcut bağlantılar korunarak eklendi.', { exact: true })).toBeVisible()
    expect(state.mappings).toHaveLength(3)
    expect(state.mappings[0]).toEqual(preserved)
    expect(appends(ai)[0].body.mappings).toEqual(expect.arrayContaining([expect.objectContaining({ sourceSchemaId: 40, targetSchemaId: 40, sourceFieldPath: pathFor(sourceFormat, 'customerCode', 'Source'), targetFieldPath: pathFor(targetFormat, 'clientId', 'Target') })]))
    expect(state.mappings[1].origin).toBe('AI_ACCEPTED')
  })
}

import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrf } from '../src/services/api.ts'
import { completeIntegration, confirmReview, createIntegration, deleteIntegration, fetchCredentials, fetchIntegrationWorkspace, saveConfigs, saveSchema, updateIntegration } from '../src/services/integrationsBackend.ts'
import { allowedSchemas, completionIssues, configDrafts, configRequests, parseJsonObject, requiredSchemas } from '../src/lib/integrationWorkflow.ts'

const originalFetch = globalThis.fetch
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const input = { serviceName: 'Sipariş', description: '', sourceSystemId: 1, destinationSystemId: 2, middlewareSystemId: null, hasMiddleware: false, syncType: 'async', formatSource: 'csv', formatDestination: 'json' }
const response = (changes = {}) => ({ id: 30, name: 'Sipariş', description: '', sourceSystemId: 1, destinationSystemId: 2, middlewareSystemId: null, sourceSystemName: 'Eski kaynak', destinationSystemName: 'Hedef', middlewareSystemName: null, environmentTypes: [], hasMiddleware: false, isSync: false, sourcePayloadFormat: 'CSV', destinationPayloadFormat: 'JSON', status: 'DRAFT', reviewRequired: false, createdAt: '2026-10-18T12:30:00', updatedAt: null, environmentConfigs: [], ...changes })
const config = (changes = {}) => ({ id: 10, environmentType: 'DEV', configTarget: 'DESTINATION', url: 'https://dev.example.test', authType: 'NONE', credentialsConfigured: false, timeoutMs: 5000, retryCount: 0, retryIntervalMs: 0, ...changes })
const record = (changes = {}) => ({ ...input, formatSource: 'json', id: '30', status: 'DRAFT', reviewRequired: false, environmentConfigs: [config()], ...changes })
const schema = (type) => ({ id: 40, schemaType: type, schemaDefinition: { type: 'object' } })
let calls
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'workflow-test' })
    return handler(url, init)
  }
}
function workspaceMock(item = response(), schemas = [], mappings = []) {
  mock((url) => {
    if (url === '/api/v1/integrations/30') return json(item)
    if (url.endsWith('/schemas')) return json(schemas)
    if (url.endsWith('/fields')) return json(mappings)
    throw new Error(`Beklenmeyen endpoint: ${url}`)
  })
}
beforeEach(() => { clearCsrf(); calls = [] })
after(() => { globalThis.fetch = originalFetch })

describe('Taslak ve kayıt yaşam döngüsü', () => {
  it('oluşturma yalnızca bir taslak POST eder; config, şema veya complete göndermez', async () => {
    mock(() => json(response(), 201))
    const saved = await createIntegration({ ...input, status: 'COMPLETED', reviewRequired: true })
    const writes = calls.filter((call) => call.method !== 'GET')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].url, '/api/v1/integrations')
    assert.equal(saved.status, 'DRAFT')
    assert.equal(saved.formatSource, 'csv')
    assert.equal(saved.description, '')
    assert.equal(saved.updatedAt, null)
    assert.deepEqual(JSON.parse(writes[0].body), { name: 'Sipariş', description: '', sourceSystemId: 1, destinationSystemId: 2, middlewareSystemId: null, hasMiddleware: false, isSync: false, sourcePayloadFormat: 'CSV', destinationPayloadFormat: 'JSON' })
  })
  it('PUT tam gövde gönderir; status, reviewRequired ve tarihleri göndermez', async () => {
    mock(() => json(response({ status: 'COMPLETED' })))
    const saved = await updateIntegration('30', { ...input, serviceName: 'Yeni isim', status: 'DRAFT', reviewRequired: true, updatedAt: 'forbidden' })
    assert.equal(saved.status, 'COMPLETED')
    const write = calls.find((call) => call.method === 'PUT')
    assert.equal(write.url, '/api/v1/integrations/30')
    assert.equal(JSON.parse(write.body).name, 'Yeni isim')
    assert.deepEqual(Object.keys(JSON.parse(write.body)).sort(), ['name', 'description', 'sourceSystemId', 'destinationSystemId', 'middlewareSystemId', 'hasMiddleware', 'isSync', 'sourcePayloadFormat', 'destinationPayloadFormat'].sort())
  })
  it('boş başarılı oluşturma yanıtını doğrulanmış kayıt saymaz; belirsiz sonuç hatası verir', async () => {
    mock(() => new Response(null, { status: 201 }))
    await assert.rejects(createIntegration(input), (error) => error.status === 0 && error.message.includes('güncel kaydı kontrol edin'))
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('teknik değişiklikte backendin DRAFT/reviewRequired yanıtını olduğu gibi korur', async () => {
    mock(() => json(response({ status: 'DRAFT', reviewRequired: true, destinationSystemId: 9 })))
    const saved = await updateIntegration('30', { ...input, destinationSystemId: 9 })
    assert.equal(saved.reviewRequired, true)
    assert.equal(saved.status, 'DRAFT')
    assert.equal(saved.destinationSystemId, 9)
  })
  it('detayın varlığını alt listelerden önce kontrol eder; 404te mapping GET başlatmaz', async () => {
    mock(() => json({ message: 'Kayıt yok' }, 404))
    await assert.rejects(fetchIntegrationWorkspace('30'), (error) => error.status === 404)
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/integrations/30'])
  })
  it('detay, şema ve eşlemeleri okur; pasif mevcut seçimi korur ve secretı kendiliğinden almaz', async () => {
    const mapping = { id: 2, sourceSchemaId: 40, targetSchemaId: 40, sourceFieldPath: 'a', targetFieldPath: 'b', isAiGenerated: false, aiConfidenceScore: null }
    workspaceMock(response({ environmentConfigs: [config({ authType: 'BASIC_AUTH', credentialsConfigured: true, authCredentials: { password: 'unexpected-test-only' } })] }), [schema('SOURCE_TO_DEST_REQUEST')], [mapping])
    const data = await fetchIntegrationWorkspace('30')
    assert.equal(calls[0].url, '/api/v1/integrations/30')
    assert.equal(data.record.sourceSystem, 'Eski kaynak')
    assert.equal(data.record.environmentConfigs[0].credentialsConfigured, true)
    assert.equal(Object.hasOwn(data.record.environmentConfigs[0], 'authCredentials'), false)
    assert.deepEqual(data.mappings, [mapping])
    assert.ok(calls.every((call) => call.method === 'GET' && !call.url.includes('/credentials')))
  })
  it('config POST bütün listeyi gönderir ve complete çağırmaz', async () => {
    mock(() => new Response(null, { status: 200 }))
    const configs = [config(), config({ id: 11, environmentType: 'TEST' }), config({ id: 12, environmentType: 'PROD' })]
    const rows = configDrafts(configs)
    rows[0].url = 'https://changed.example.test'
    await saveConfigs('30', configRequests(rows, configs, false, false))
    const writes = calls.filter((call) => call.method !== 'GET')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].url, '/api/v1/integrations/30/configs')
    const body = JSON.parse(writes[0].body)
    assert.deepEqual(body.map((item) => item.environmentType), ['DEV', 'TEST', 'PROD'])
    assert.ok(body.every((item) => !('id' in item) && !('credentialsConfigured' in item)))
  })
  it('aynı türde şema kaydı upsert endpointini kullanır; otomatik field/complete yazmaz', async () => {
    mock(() => json(schema('SOURCE_TO_DEST_REQUEST')))
    const saved = await saveSchema('30', 'SOURCE_TO_DEST_REQUEST', { order: { id: 'string' } })
    assert.equal(saved.id, 40)
    assert.deepEqual(calls.filter((call) => call.method === 'POST').map((call) => call.url), ['/api/v1/integrations/30/mappings/schemas'])
    assert.deepEqual(JSON.parse(calls.at(-1).body), { schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'JSON', schemaDefinition: { order: { id: 'string' } } })
  })
  it('doğrudan istek ve yanıt içeriğini ayrı şemalara değiştirmeden kaydeder; eşleme yazmaz', async () => {
    const request = { orderId: '123', lines: [{ sku: 'ABC', quantity: 2 }], source: 'ERP', target: 'CRM' }
    const response = { accepted: true, externalId: 'X-123', errors: [] }
    mock((url, init) => {
      assert.ok(url.endsWith('/mappings/schemas'))
      assert.equal(init.method, 'POST')
      return json({ id: 40, ...JSON.parse(init.body) })
    })
    const savedRequest = await saveSchema('30', 'SOURCE_TO_DEST_REQUEST', parseJsonObject(JSON.stringify(request), 'İstek'))
    const savedResponse = await saveSchema('30', 'DEST_TO_SOURCE_RESPONSE', parseJsonObject(JSON.stringify(response), 'Yanıt'))
    assert.deepEqual(savedRequest.schemaDefinition, request)
    assert.deepEqual(savedResponse.schemaDefinition, response)
    assert.deepEqual(request.source, 'ERP')
    assert.equal(calls.filter((call) => call.method === 'POST').length, 2)
    assert.ok(calls.every((call) => !/fields|complete|review/.test(call.url)))
  })
  it('inceleme onayı ve tamamlama ayrı isteklerdir; 200 boş gövdeleri işler', async () => {
    mock(() => new Response(null, { status: 200 }))
    await confirmReview('30')
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 1)
    assert.equal(calls.at(-1).url, '/api/v1/integrations/30/review/confirm')
    assert.deepEqual(JSON.parse(calls.at(-1).body), { confirmed: true })
    await completeIntegration('30')
    assert.equal(calls.at(-1).method, 'PATCH')
    assert.equal(calls.at(-1).url, '/api/v1/integrations/30/complete')
    assert.equal(calls.at(-1).body, undefined)
  })
  it('tamamlama 409 ayrıntılarını kaybetmez ve otomatik yeniden denemez', async () => {
    mock(() => json({ code: 'INTEGRATION_INCOMPLETE', message: 'Not ready', violations: [{ field: null, code: 'REVIEW_REQUIRED', params: {} }, { field: null, code: 'REQUIRED_SCHEMA_MISSING', params: { schemaType: 'SOURCE_TO_DEST_REQUEST' } }] }, 409))
    await assert.rejects(completeIntegration('30'), (error) => error.status === 409 && error.details.length === 2)
    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1)
  })
  it('credential endpointini yalnızca açık çağrıda doğru ortam/hedefle kullanır', async () => {
    mock(() => json({ authCredentials: { apiKey: 'test-only' } }))
    assert.deepEqual((await fetchCredentials('30', config({ environmentType: 'PROD', configTarget: 'MIDDLEWARE' }))).authCredentials, { apiKey: 'test-only' })
    assert.equal(calls[0].url, '/api/v1/integrations/30/configs/PROD/MIDDLEWARE/credentials')
  })
  it('entegrasyon DELETE isteğinde boş 204 işler', async () => {
    mock(() => new Response(null, { status: 204 }))
    assert.equal(await deleteIntegration('30'), undefined)
    assert.equal(calls.at(-1).method, 'DELETE')
    assert.equal(calls.at(-1).url, '/api/v1/integrations/30')
  })
})

describe('Ortam, credential ve tamamlama kuralları', () => {
  it('dört akış için zorunlu şema matrisini uygular', () => {
    assert.deepEqual(requiredSchemas(record()), ['SOURCE_TO_DEST_REQUEST'])
    assert.deepEqual(requiredSchemas(record({ syncType: 'sync' })), ['SOURCE_TO_DEST_REQUEST', 'DEST_TO_SOURCE_RESPONSE'])
    assert.deepEqual(requiredSchemas(record({ hasMiddleware: true })), ['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST'])
    assert.deepEqual(requiredSchemas(record({ hasMiddleware: true, syncType: 'sync' })), ['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST', 'DEST_TO_MW_RESPONSE', 'MW_TO_SOURCE_RESPONSE'])
  })
  it('asenkron akışta aynı topolojinin yanıt şemaları bulunabilir', () => {
    assert.ok(allowedSchemas(record()).includes('DEST_TO_SOURCE_RESPONSE'))
    assert.deepEqual(completionIssues(record(), [schema('SOURCE_TO_DEST_REQUEST'), schema('DEST_TO_SOURCE_RESPONSE')]), [])
  })
  it('tek DEV ortamı yeterlidir; ara katman için her ortamda iki hedef gerekir', () => {
    assert.deepEqual(completionIssues(record(), [schema('SOURCE_TO_DEST_REQUEST')]), [])
    const mw = record({ hasMiddleware: true, environmentConfigs: [config(), config({ environmentType: 'TEST', configTarget: 'MIDDLEWARE' })] })
    const issues = completionIssues(mw, requiredSchemas(mw).map(schema))
    assert.ok(issues.some((issue) => issue.includes('DEV ortamında ara katman')))
    assert.ok(issues.some((issue) => issue.includes('TEST ortamında hedef')))
  })
  it('inceleme, boş şema ve önceki topolojiden kalan uyumsuz şemaları raporlar', () => {
    const issues = completionIssues(record({ reviewRequired: true }), [{ ...schema('SOURCE_TO_DEST_REQUEST'), schemaDefinition: {} }, schema('SOURCE_TO_MW_REQUEST')])
    assert.ok(issues.some((issue) => issue.includes('inceleme onayı')))
    assert.ok(issues.some((issue) => issue.includes('eksik veya boş')))
    assert.ok(issues.some((issue) => issue.includes('Önceki akışa ait uyumsuz şemalar') && issue.includes('inceleme onayı bu engeli kaldırmaz')))
  })
  it('JSON nesnesi dışındaki şemaları veya hatalı JSONu raw alana sarmaz, reddeder', () => {
    for (const value of ['<xml/>', 'null', '[]', '42', '"text"']) assert.throws(() => parseJsonObject(value, 'Şema'), /JSON nesnesi/)
    assert.deepEqual(parseJsonObject('{"a":1}', 'Şema'), { a: 1 })
  })
  it('aynı auth türünde boş credential alanı kayıtlı bilgiyi korur; maskeyi göndermez', () => {
    const original = [config({ authType: 'BASIC_AUTH', credentialsConfigured: true })]
    const rows = configDrafts(original)
    assert.equal(rows[0].credentialsText, '')
    rows[0].url = 'https://new.example.test'
    const [saved] = configRequests(rows, original, false, false)
    assert.equal(saved.url, rows[0].url)
    assert.equal(Object.hasOwn(saved, 'authCredentials'), false)
    assert.equal(Object.hasOwn(saved, 'credentialsConfigured'), false)
  })
  it('credentialı değiştirmek için dolu nesne, temizlemek için NONE gerekir', () => {
    const original = [config({ authType: 'API_KEY', credentialsConfigured: true })]
    const rows = configDrafts(original)
    rows[0].credentialsText = '{}'
    assert.throws(() => configRequests(rows, original, false, true), /Boş erişim/)
    rows[0].credentialsText = '{"apiKey":"new-test-only"}'
    assert.deepEqual(configRequests(rows, original, false, true)[0].authCredentials, { apiKey: 'new-test-only' })
    rows[0].authType = 'NONE'; rows[0].credentialsText = ''
    const [cleared] = configRequests(rows, original, false, true)
    assert.equal(cleared.authType, 'NONE')
    assert.equal(Object.hasOwn(cleared, 'authCredentials'), false)
  })
  it('auth türü değişince veya yeni auth config eklendiğinde eski bilgiyi taşımaz', () => {
    const original = [config({ authType: 'API_KEY', credentialsConfigured: true })]
    const rows = configDrafts(original)
    rows[0].authType = 'BASIC_AUTH'
    assert.throws(() => configRequests(rows, original, false, true), /yeni erişim bilgisi/)
    assert.throws(() => configRequests(rows, [], false, true), /yeni erişim bilgisi/)
  })
  it('izinsiz credential yazmayı, auth türü değiştirmeyi ve secret config silmeyi reddeder', () => {
    const original = [config({ authType: 'API_KEY', credentialsConfigured: true })]
    const rows = configDrafts(original)
    rows[0].credentialsText = '{"apiKey":"test"}'
    assert.throws(() => configRequests(rows, original, false, false), /izniniz yok/)
    rows[0].credentialsText = ''; rows[0].authType = 'NONE'
    assert.throws(() => configRequests(rows, original, false, false), /izniniz yok/)
    assert.throws(() => configRequests([], original, false, false), /kaldırmak için/)
    assert.deepEqual(configRequests([], original, false, true), [])
  })
  it('tekrarlanan ortam/hedef, boş adres ve geçersiz sayıları reddeder; sıfır retry kabul eder', () => {
    const rows = configDrafts([config()])
    assert.throws(() => configRequests([...rows, ...rows], [], false, true), /birden fazla/)
    assert.throws(() => configRequests([{ ...rows[0], url: ' ' }], [], false, true), /URL alanı boş/)
    for (const values of [{ timeoutMs: '0' }, { retryCount: '-1' }, { retryIntervalMs: '1.5' }, { timeoutMs: 'bad' }]) assert.throws(() => configRequests([{ ...rows[0], ...values }], [], false, true), /tam sayı/)
    assert.equal(configRequests(rows, [], false, true)[0].retryCount, 0)
    assert.equal(configRequests(rows, [], false, true)[0].retryIntervalMs, 0)
  })
  it('doğrudan akışta kalan ara katman configini sessizce filtrelemez', () => {
    const original = [config({ configTarget: 'MIDDLEWARE' })]
    assert.throws(() => configRequests(configDrafts(original), original, false, true), /ara katman/)
  })
})

import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrf } from '../src/services/api.ts'
import { fetchIntegrationWorkspace, saveMappings } from '../src/services/integrationsBackend.ts'
import { completionIssues } from '../src/lib/integrationWorkflow.ts'
import { extractFields, schemaFieldTree, fieldNotes, mappingCompletionIssues, mappingDrafts, mappingIssues, mappingPairs, mappingRequests, pairForMapping, pairSupportsMapping } from '../src/lib/mapping.ts'

const direct = { hasMiddleware: false, syncType: 'sync' }
const middleware = { hasMiddleware: true, syncType: 'sync' }
const schema = (id, schemaType, schemaDefinition = { type: 'object', properties: { orderId: { type: 'string' } } }) => ({ id, schemaType, schemaDefinition })
const directSchemas = [schema(10, 'SOURCE_TO_DEST_REQUEST'), schema(11, 'DEST_TO_SOURCE_RESPONSE')]
const mwSchemas = [schema(20, 'SOURCE_TO_MW_REQUEST'), schema(21, 'MW_TO_DEST_REQUEST'), schema(22, 'DEST_TO_MW_RESPONSE'), schema(23, 'MW_TO_SOURCE_RESPONSE')]
const mapping = (changes = {}) => ({ sourceSchemaId: 20, sourceFieldPath: 'orderId', targetSchemaId: 21, targetFieldPath: 'externalId', ...changes })
const paths = (tree) => tree.fields.map((field) => field.path)
const originalFetch = globalThis.fetch
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
let calls
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'mapping-test' })
    return handler(url, init)
  }
}
beforeEach(() => { clearCsrf(); calls = [] })
after(() => { globalThis.fetch = originalFetch })

describe('Alan eşleme çiftleri ve bütün liste kaydı', () => {
  it('doğrudan akışta her yönü aynı şemaya bağlar; request ile response eşlenemez', () => {
    assert.deepEqual(mappingPairs(direct, directSchemas).map((pair) => [pair.source.id, pair.target.id]), [[10, 10], [11, 11]])
    assert.deepEqual(mappingCompletionIssues(direct, directSchemas, []), [])
    assert.equal(mappingRequests(direct, directSchemas, [mapping({ sourceSchemaId: 10, targetSchemaId: 10 })]).length, 1)
    assert.throws(() => mappingRequests(direct, directSchemas, [mapping({ sourceSchemaId: 10, targetSchemaId: 11 })]), /Şema çifti/)
    assert.deepEqual(mappingRequests(direct, directSchemas, []), [])
  })
  it('ara katmanda senkron tamamlama eşleme gerektirmez; varsa her iki yönü de doğrular', () => {
    const request = mapping()
    const response = mapping({ sourceSchemaId: 22, targetSchemaId: 23 })
    assert.deepEqual(mappingCompletionIssues(middleware, mwSchemas, []), [])
    assert.deepEqual(mappingCompletionIssues(middleware, mwSchemas, [request]), [])
    assert.deepEqual(mappingCompletionIssues(middleware, mwSchemas, [response]), [])
    assert.deepEqual(mappingCompletionIssues(middleware, mwSchemas, [request, response]), [])
    assert.deepEqual(mappingIssues(middleware, mwSchemas, []), [])
  })
  it('ara katmanda asenkron tamamlama eşlemesiz de yapılabilir', () => {
    const record = { ...middleware, syncType: 'async' }
    assert.deepEqual(mappingCompletionIssues(record, mwSchemas.slice(0, 2), [mapping()]), [])
    assert.deepEqual(mappingCompletionIssues(record, mwSchemas, []), [])
    assert.deepEqual(mappingCompletionIssues(record, mwSchemas, [mapping(), mapping({ sourceSchemaId: 22, targetSchemaId: 23 })]), [])
  })
  it('doğrudan akışta eski eşlemeleri sessizce yok saymaz veya silmez', () => {
    const saved = [{ id: 7, ...mapping() }]
    assert.match(mappingCompletionIssues(direct, directSchemas, saved)[0], /Şema çifti/)
    assert.equal(saved.length, 1)
    assert.equal(calls.length, 0)
  })
  it('ara katmanda request ve ters yöndeki response çiftlerini kullanır', () => {
    assert.deepEqual(mappingPairs(middleware, mwSchemas).map((pair) => [pair.source.id, pair.target.id]), [[20, 21], [22, 23]])
    assert.deepEqual(mappingIssues(middleware, mwSchemas, [mapping({ sourceSchemaId: 20, targetSchemaId: 21 }), mapping({ sourceSchemaId: 22, targetSchemaId: 23 })]), [])
    assert.ok(mappingIssues(middleware, mwSchemas, [mapping({ sourceSchemaId: 21, targetSchemaId: 20 })]).length)
  })
  it('asenkron akışta kayıtlı isteğe bağlı response çiftini de korur', () => {
    const asyncRecord = { ...middleware, syncType: 'async' }
    assert.equal(mappingPairs(asyncRecord, mwSchemas)[1].target.id, 23)
    assert.deepEqual(mappingIssues(asyncRecord, mwSchemas, [mapping({ sourceSchemaId: 22, targetSchemaId: 23 })]), [])
  })
  it('eksik/başka entegrasyona ait IDleri veya eski topoloji çiftlerini sessizce silmez', () => {
    const saved = [{ id: 8, ...mapping({ sourceSchemaId: 1000, targetSchemaId: 2000 }) }]
    const drafts = mappingDrafts(saved)
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].sourceSchemaId, 1000)
    assert.ok(mappingIssues(middleware, mwSchemas, drafts).length)
    assert.equal(pairForMapping(mappingPairs(middleware, []), drafts[0]), undefined)
    assert.throws(() => mappingRequests(middleware, mwSchemas, drafts), /Şema çifti/)
  })
  it('boş/uzun yolları ve yinelenen bağlantıyı engeller; fan-in/fan-out eşlemelerine izin verir', () => {
    for (const change of [{ sourceFieldPath: ' ' }, { targetFieldPath: 'x'.repeat(501) }, { sourceSchemaId: 1.5 }]) assert.ok(mappingIssues(middleware, mwSchemas, [mapping(change)]).length)
    assert.ok(mappingIssues(middleware, mwSchemas, [mapping(), mapping({ sourceFieldPath: ' orderId ' })]).some((issue) => issue.includes('birden fazla')))
    assert.deepEqual(mappingIssues(middleware, mwSchemas, [mapping(), mapping({ targetFieldPath: 'another' }), mapping({ sourceFieldPath: 'another' })]), [])
  })
  it('manuel yolu şemada bulunmadığı için engellemez; bilinmeyen yol hakkında yalnızca not verir', () => {
    assert.equal(mappingRequests(middleware, mwSchemas, [mapping({ sourceFieldPath: 'dynamic.custom[0].value' })])[0].sourceFieldPath, 'dynamic.custom[0].value')
    assert.ok(fieldNotes(mapping(), [], []).every((note) => note.includes('bulunamadı')))
  })
  it('tek satır değiştirilince diğer request/response eşlemeleri tam listede kalır', () => {
    const saved = [{ id: 1, ...mapping() }, { id: 2, ...mapping({ sourceSchemaId: 22, targetSchemaId: 23, sourceFieldPath: 'result', targetFieldPath: 'ok' }) }]
    const drafts = mappingDrafts(saved)
    drafts[0].targetFieldPath = ' changed '
    const body = mappingRequests(middleware, mwSchemas, drafts)
    assert.equal(body.length, 2)
    assert.equal(body[0].targetFieldPath, 'changed')
    assert.equal(body[1].sourceSchemaId, 22)
    assert.equal(body[1].targetFieldPath, 'ok')
    assert.ok(body.every((item) => !Object.hasOwn(item, 'id') && !Object.hasOwn(item, 'key') && item.isAiGenerated === false && item.aiConfidenceScore === null))
    assert.equal(saved[0].targetFieldPath, 'externalId')
  })
  it('kaldırılan satırın dışındaki kayıtları tutar; tümünü temizlemek için [] üretir', () => {
    const drafts = mappingDrafts([{ id: 1, ...mapping() }, { id: 2, ...mapping({ targetFieldPath: 'second' }) }])
    assert.equal(mappingRequests(middleware, mwSchemas, drafts.filter((row) => row.key !== 'saved-1'))[0].targetFieldPath, 'second')
    assert.deepEqual(mappingRequests(middleware, mwSchemas, []), [])
  })
  it('POST fields gövdesini whitelist eder ve AI/readonly alanlarını manuel sözleşmeye çevirir', async () => {
    mock(() => new Response(null, { status: 200 }))
    await saveMappings('30', [{ ...mapping(), id: 100, key: 'local', isAiGenerated: true, aiConfidenceScore: 0.9, transformationRule: 'unsupported' }])
    const write = calls.find((call) => call.method === 'POST')
    assert.equal(write.url, '/api/v1/integrations/30/mappings/fields')
    assert.deepEqual(JSON.parse(write.body), [{ ...mapping(), isAiGenerated: false, aiConfidenceScore: null }])
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 1)
    assert.equal(new Headers(write.headers).get('X-CSRF-TOKEN'), 'mapping-test')
  })
  it('alan listesini [] ile temizler ve complete/review çağırmaz', async () => {
    mock(() => new Response(null, { status: 200 }))
    await saveMappings('30', [])
    assert.equal(calls.at(-1).body, '[]')
    assert.equal(calls.at(-1).url, '/api/v1/integrations/30/mappings/fields')
    assert.ok(calls.every((call) => !/complete|review/.test(call.url)))
  })
  it('geçersiz eşlemede ağ isteği başlatmaz ve backend 409 yanıtını otomatik tekrarlamaz', async () => {
    mock(() => json({ code: 'CONFLICT', message: 'Conflict', violations: [{ field: null, code: 'FORMAT_MISMATCH', params: {} }] }, 409))
    await assert.rejects(async () => saveMappings('30', mappingRequests(middleware, mwSchemas, [mapping({ targetSchemaId: 11 })])), /Şema çifti/)
    assert.equal(calls.length, 0)
    await assert.rejects(saveMappings('30', mappingRequests(middleware, mwSchemas, [mapping()])), (error) => error.status === 409 && error.details[0].includes('İçerik formatı'))
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('kaydetme sonrası yeniden okumada değişmiş mapping IDlerini ve DRAFT/inceleme durumunu kullanır', async () => {
    mock((url) => {
      if (url.endsWith('/fields')) return json([{ id: 200, ...mapping(), isAiGenerated: false, aiConfidenceScore: null }])
      if (url.endsWith('/schemas')) return json(mwSchemas)
      if (url.endsWith('/integrations/30')) return json({ id: 30, name: 'Kayıt', sourceSystemId: 1, destinationSystemId: 2, hasMiddleware: true, isSync: true, sourcePayloadFormat: 'JSON', destinationPayloadFormat: 'JSON', status: 'DRAFT', reviewRequired: true, environmentConfigs: [] })
      return json([])
    })
    const data = await fetchIntegrationWorkspace('30')
    assert.equal(data.mappings[0].id, 200)
    assert.equal(mappingDrafts(data.mappings)[0].key, 'saved-200')
    assert.equal(data.record.status, 'DRAFT')
    assert.equal(data.record.reviewRequired, true)
  })
  it('inceleme kontrolüne uyumsuz kayıtlı eşlemeleri ekler', () => {
    const record = { ...middleware, environmentConfigs: [{ environmentType: 'DEV', configTarget: 'DESTINATION' }] }
    assert.ok(completionIssues(record, mwSchemas, [{ id: 1, ...mapping({ targetSchemaId: 11 }) }]).some((issue) => issue.includes('Şema çifti')))
  })
})

describe('XML/IDOC alan kimlikleri ve format desteği', () => {
  const field = (path, changes = {}) => ({ name: 'id', path, kind: 'element', type: 'string', namespaceUri: '', repeated: false, children: [], ...changes })
  const xml = (changes = {}) => ({ id: 20, schemaType: 'SOURCE_TO_MW_REQUEST', format: 'XML', mappingSupported: true, schemaDefinition: { kind: 'xml', fields: [field('/{urn:orders}order', { type: 'object', children: [field('/{urn:orders}order/@id', { kind: 'attribute' }), field('/{urn:orders}order/line', { repeated: true })] })] }, ...changes })
  it('namespace, attribute ve tekrar yollarını değiştirmez; JSON metadata yolları üretmez', () => {
    const tree = schemaFieldTree(xml())
    assert.deepEqual(paths(tree), ['/{urn:orders}order', '/{urn:orders}order/@id', '/{urn:orders}order/line'])
    assert.equal(tree.fields[1].kind, 'attribute')
    assert.equal(tree.fields[2].repeated, true)
    assert.equal(tree.fields[2].depth, 1)
    assert.deepEqual(paths(schemaFieldTree(xml(), 'sample')), paths(tree))
  })
  it('IDOC XML ağacını aynı yöntemle okur; JSON içindeki fields/path anahtarları JSON kalır', () => {
    assert.deepEqual(paths(schemaFieldTree(xml({ format: 'IDOC', schemaDefinition: { kind: 'idoc-xml', fields: [field('/ORDERS05/IDOC/BELNR')] } }))), ['/ORDERS05/IDOC/BELNR'])
    assert.ok(paths(schemaFieldTree(xml({ format: 'JSON' }), 'sample')).includes('fields[0].path'))
  })
  it('CSV/Excel içeren çiftleri kapatır, geçerli eşlemeleri temizlerken diğer çiftleri korur', () => {
    for (const format of ['CSV', 'EXCEL']) {
      const schemas = [xml({ format, mappingSupported: false, schemaDefinition: {} }), mwSchemas[1], mwSchemas[2], mwSchemas[3]]
      assert.equal(pairSupportsMapping(mappingPairs(middleware, schemas)[0]), false)
      assert.deepEqual(schemaFieldTree(schemas[0]).fields, [])
      assert.throws(() => mappingRequests(middleware, schemas, [mapping()]), /CSV\/Excel/)
      assert.equal(mappingRequests(middleware, schemas, [mapping({ sourceSchemaId: 22, targetSchemaId: 23 })]).length, 1)
      assert.deepEqual(mappingCompletionIssues(middleware, schemas, []), [])
    }
  })
  it('XML yol varlığını denetler; JSON yollarında eski serbest davranışı korur', () => {
    const schemas = [xml(), mwSchemas[1]]
    assert.throws(() => mappingRequests(middleware, schemas, [mapping()]), /XML\/IDOC ağacında bulunamadı/)
    assert.equal(mappingRequests(middleware, schemas, [mapping({ sourceFieldPath: '/{urn:orders}order/@id' })]).length, 1)
    assert.equal(mappingRequests(middleware, mwSchemas, [mapping({ sourceFieldPath: 'custom.path' })]).length, 1)
  })
  it('görsel sınır dışında kalan XML yollarını doğrulamada kaybetmez', () => {
    const wide = xml({ schemaDefinition: { kind: 'xml', fields: Array.from({ length: 400 }, (_, index) => field(`/order/f${index}`)) } })
    assert.equal(schemaFieldTree(wide).truncated, true)
    assert.equal(mappingRequests(middleware, [wide, mwSchemas[1]], [mapping({ sourceFieldPath: '/order/f399' })]).length, 1)
  })
})

describe('Ara katman alan ağaçları', () => {
  it('JSON Schema properties/items ağacını payload alan yollarına dönüştürür', () => {
    const tree = extractFields({ type: 'object', properties: { order: { type: 'object', properties: { id: { type: 'string' } } }, lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } } } })
    assert.deepEqual(paths(tree), ['order', 'order.id', 'lines', 'lines[0]', 'lines[0].sku'])
    assert.equal(tree.fields.find((field) => field.path === 'order.id').type, 'string')
    assert.ok(!paths(tree).some((path) => path.includes('properties')))
  })
  it('örnek JSON dizilerinde aynı temsili yolu tekrar etmez ve farklı öğe alanlarını korur', () => {
    const tree = extractFields({ items: [{ id: 1 }, { id: 2, name: 'n' }] }, 'sample')
    assert.deepEqual(paths(tree), ['items', 'items[0]', 'items[0].id', 'items[0].name'])
  })
  it('nokta, köşeli parantez, tırnak, boş ve özel adları belirsiz olmayan yollarla gösterir', () => {
    const tree = extractFields(JSON.parse('{"a.b":{"x[y]":1},"":null,"quote\\\"":true,"__proto__":"safe"}'), 'sample')
    assert.deepEqual(paths(tree), ['["a.b"]', '["a.b"]["x[y]"]', '[""]', '["quote\\\""]', '__proto__'])
  })
  it('payloadın type/properties gibi alanları varsa örnek JSON modu ile açıkça okunabilir', () => {
    const value = { type: 'invoice', properties: { code: 'X' } }
    assert.ok(paths(extractFields(value, 'sample')).includes('type'))
    assert.ok(paths(extractFields(value, 'sample')).includes('properties.code'))
  })
  it('eksik şema için alan üretmez', () => {
    assert.deepEqual(extractFields(undefined).fields, [])
  })
  it('$ref için ağ çağırmaz; birleşik/dinamik şemaların sınırlarını bildirir', () => {
    const tree = extractFields({ type: 'object', properties: { ref: { $ref: 'https://example.test/schema' } }, anyOf: [{ properties: { a: { type: 'string' } } }, { properties: { b: { type: 'number' } } }], additionalProperties: true })
    assert.ok(paths(tree).includes('ref'))
    assert.ok(paths(tree).includes('a'))
    assert.ok(paths(tree).includes('b'))
    assert.equal(tree.warnings.length, 3)
    assert.equal(calls.length, 0)
  })
  it('tuple şemasında her öğenin gerçek indeksini kullanır', () => {
    assert.deepEqual(paths(extractFields({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] })), ['[0]', '[1]'])
  })
  it('çok geniş veya çok derin ağaçları sınırlar; uyarır ve mevcut yolları silmez', () => {
    const wide = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`field${index}`, index]))
    const tree = extractFields(wide, 'sample')
    assert.equal(tree.fields.length, 250)
    assert.equal(tree.truncated, true)
    assert.ok(tree.warnings.length)
    let deep = { end: 1 }
    for (let index = 0; index < 50; index++) deep = { nested: deep }
    assert.equal(extractFields(deep, 'sample').truncated, true)
    assert.equal(mappingRequests(middleware, mwSchemas, [mapping({ sourceFieldPath: 'field399' })]).length, 1)
  })
  it('tip farklılıkları yalnızca nottur; integer/number uyumlu, unknown belirsiz kabul edilir', () => {
    const field = (path, type) => ({ path, type, depth: 0 })
    assert.ok(fieldNotes(mapping(), [field('orderId', 'string')], [field('externalId', 'number')]).some((note) => note.includes('Türler farklı')))
    assert.deepEqual(fieldNotes(mapping(), [field('orderId', 'integer')], [field('externalId', 'number')]), [])
    assert.deepEqual(fieldNotes(mapping(), [field('orderId', 'unknown | string')], [field('externalId', 'number')]), [])
  })
})

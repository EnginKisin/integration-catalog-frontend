import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrf, ApiError } from '../src/services/api.ts'
import { appendMappings, createAiJob, fetchAiCapabilities, fetchAiJob, fetchAiResult, fetchMappingContext } from '../src/services/aiMappingBackend.ts'
import { uploadSchemaSample } from '../src/services/integrationsBackend.ts'
import { canonicalFieldPath, canonicalMapping, protectedDrafts, suggestionIssues } from '../src/lib/aiMapping.ts'
import { mappingDrafts, mappingIssues, mappingPairs, schemaFieldTree } from '../src/lib/mapping.ts'
import { contentRequest, hasIndependentTarget, schemaContentIssue, targetContent, targetSchema, targetText } from '../src/lib/payload.ts'
import { integrationSteps } from '../src/lib/integrationWorkflow.ts'

const originalFetch = globalThis.fetch
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const source = { id: 40, schemaType: 'SOURCE_TO_MW_REQUEST', format: 'JSON', schemaDefinition: { customer: { id: '42' }, email: 'demo@example.test' } }
const target = { id: 41, schemaType: 'MW_TO_DEST_REQUEST', format: 'JSON', schemaDefinition: { client: { id: '42' }, email: 'demo@example.test' } }
const value = { sourceSchemaId: 40, targetSchemaId: 41, sourceFieldPath: '/customer/id', targetFieldPath: '/client/id' }
const suggestion = { ...value, suggestionId: 'suggestion-1', confidence: 'HIGH', reason: 'Aynı müşteri kodu.' }
const context = { contextRevision: 'revision-1', schemas: [source, target], mappings: [] }
const job = { jobId: 'job-1', status: 'QUEUED', createdAt: '2026-10-30T10:00:00Z', expiresAt: '2026-10-31T10:00:00Z', pollAfterMs: 2000 }
const result = { jobId: job.jobId, contextRevision: context.contextRevision, stale: false, provider: 'ollama', model: 'local-model', suggestions: [suggestion], unmatchedSourceFields: [], unmatchedTargetFields: [], warnings: [] }
let calls
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url === '/api/v1/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'ai-test' })
    return handler(url, init)
  }
}
beforeEach(() => { clearCsrf(); calls = [] })
after(() => { globalThis.fetch = originalFetch })

describe('AI eşleme sözleşmesi ve onay kaydı', () => {
  it('bağlamı, kullanılabilirliği, işi ve sonucu aynı origin üzerinden ayrı okur', async () => {
    mock((url) => json(url.endsWith('/context') ? context : url.endsWith('/capabilities') ? { enabled: false, available: false, supportedFormats: ['JSON', 'XML', 'IDOC'], code: 'AI_DISABLED' } : url.endsWith('/result') ? result : job))
    assert.deepEqual(await fetchMappingContext('30'), context)
    assert.equal((await fetchAiCapabilities('30')).enabled, false)
    assert.equal((await fetchAiJob('30', job.jobId)).status, 'QUEUED')
    assert.deepEqual(await fetchAiResult('30', job.jobId), result)
    assert.ok(calls.every((call) => call.method === 'GET' && call.credentials === 'include'))
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/integrations/30/mappings/context', '/api/v1/integrations/30/mappings/ai/capabilities', '/api/v1/integrations/30/mappings/ai/jobs/job-1', '/api/v1/integrations/30/mappings/ai/jobs/job-1/result'])
  })
  it('iş oluştururken sunucu sürümünü, taslak korumalarını ve kullanıcının örnek tercihini gönderir', async () => {
    mock(() => json(job, 202))
    const input = { sourceSchemaId: 40, targetSchemaId: 41, expectedContextRevision: 'revision-1', protectedMappings: [value], options: { useSampleValues: false } }
    assert.equal((await createAiJob('30', input, 'create-key')).jobId, job.jobId)
    const call = calls.at(-1)
    assert.deepEqual(JSON.parse(call.body), input)
    assert.equal(new Headers(call.headers).get('Idempotency-Key'), 'create-key')
    assert.equal(new Headers(call.headers).get('X-CSRF-TOKEN'), 'ai-test')
    assert.equal(call.url, '/api/v1/integrations/30/mappings/ai/jobs')
  })
  it('onayda yalnızca seçilen yeni bağlantıları append eder; kökeni ve güven yüzdesini istemci yazmaz', async () => {
    const added = { id: 81, ...value, origin: 'AI_EDITED', isAiGenerated: false, aiConfidenceScore: null, aiJobId: job.jobId, aiSuggestionId: suggestion.suggestionId }
    mock(() => json({ contextRevision: 'revision-2', addedMappings: [added] }))
    const input = { expectedContextRevision: 'revision-1', aiJobId: job.jobId, mappings: [{ ...suggestion, origin: 'AI_ACCEPTED', isAiGenerated: true, aiConfidenceScore: 99 }] }
    const saved = await appendMappings('30', input, 'append-key')
    assert.deepEqual(saved.addedMappings, [added])
    assert.deepEqual(JSON.parse(calls.at(-1).body), { expectedContextRevision: 'revision-1', aiJobId: job.jobId, mappings: [{ ...value, suggestionId: suggestion.suggestionId }] })
    assert.equal(new Headers(calls.at(-1).headers).get('Idempotency-Key'), 'append-key')
    assert.ok(!calls.some((call) => call.url.endsWith('/mappings/fields')))
  })
  it('manuel append AI işi içermez; aynı anahtar ve gövde kullanıcı isteğiyle tekrar kullanılabilir', async () => {
    mock(() => json({ contextRevision: 'revision-2', addedMappings: [{ ...value, id: 81 }] }))
    const input = { expectedContextRevision: 'revision-1', mappings: [value] }
    await appendMappings('30', input, 'same-key')
    await appendMappings('30', input, 'same-key')
    const writes = calls.filter((call) => call.method === 'POST')
    assert.equal(writes.length, 2)
    assert.equal(writes[0].body, writes[1].body)
    assert.equal(Object.hasOwn(JSON.parse(writes[0].body), 'aiJobId'), false)
  })
  it('eski sürüm, çakışma ve süresi dolan sonucu otomatik tekrar etmez', async () => {
    for (const [status, code] of [[409, 'CONTEXT_CHANGED'], [409, 'MAPPING_CONFLICT'], [410, 'AI_RESULT_EXPIRED']]) {
      calls = []
      mock(() => json({ message: 'İşlem reddedildi.', code }, status))
      await assert.rejects(appendMappings('30', { expectedContextRevision: 'revision-1', mappings: [value] }, `key-${code}`), (error) => error instanceof ApiError && error.status === status && error.code === code)
      assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
    }
  })
  it('FAILED işini HTTP hatası sanmaz; sıfır öneriyi başarılı sonuç kabul eder', async () => {
    mock((url) => json(url.endsWith('/result') ? { ...result, suggestions: [] } : { ...job, status: 'FAILED', errorCode: 'AI_TIMEOUT' }))
    assert.equal((await fetchAiJob('30', job.jobId)).errorCode, 'AI_TIMEOUT')
    assert.deepEqual((await fetchAiResult('30', job.jobId)).suggestions, [])
  })
  it('bozuk veya başka işe ait sonuçları, tekrar eden öneri kimliklerini reddeder', async () => {
    for (const bad of [{ ...result, jobId: 'other' }, { ...result, suggestions: [suggestion, suggestion] }, { ...result, suggestions: [{ ...suggestion, confidence: 99 }] }, { ...result, unmatchedSourceFields: ['bad'] }]) {
      mock(() => json(bad))
      await assert.rejects(fetchAiResult('30', job.jobId), /beklenen yanıt/)
    }
  })
  it('geçersiz kimlik, anahtar ve boş ekleme için ağ isteği yapmaz', async () => {
    await assert.rejects(fetchMappingContext('../other'), /Geçerli/)
    await assert.rejects(createAiJob('30', {}, ''), /anahtarı/)
    await assert.rejects(appendMappings('30', { expectedContextRevision: 'revision-1', mappings: [] }, 'key'), /bağlantılarını/)
    assert.equal(calls.length, 0)
  })
})

describe('Canonical alan yolları ve korunmuş taslaklar', () => {
  it('JSON dizilerini ve özel anahtarları JSON Pointer biçiminde taşır', () => {
    assert.equal(canonicalFieldPath('customer.id', 'JSON'), '/customer/id')
    assert.equal(canonicalFieldPath('lines[0].sku', 'JSON'), '/lines/*/sku')
    assert.equal(canonicalFieldPath('["a/b"]["~key"][""]', 'JSON'), '/a~1b/~0key/')
    assert.equal(canonicalFieldPath('["literal.dot"]', 'JSON'), '/literal.dot')
    assert.equal(canonicalFieldPath('/lines/*/sku', 'JSON'), '/lines/*/sku')
    assert.throws(() => canonicalFieldPath('bad[', 'JSON'), /JSON alan/)
  })
  it('XML namespace ve IDOC kimliklerini değiştirmez', () => {
    assert.equal(canonicalFieldPath('/{https://example.test/ns}Customer/@code', 'XML'), '/{https://example.test/ns}Customer/@code')
    assert.equal(canonicalFieldPath('/DEBMAS07/IDOC/E1KNA1M/KUNNR', 'IDOC'), '/DEBMAS07/IDOC/E1KNA1M/KUNNR')
  })
  it('yalnızca seçili çiftteki kaydedilmemiş bağlantıları koruma listesine alır', () => {
    const pairs = mappingPairs({ hasMiddleware: true }, [source, target])
    const saved = [{ id: 1, ...value }]
    const rows = [...mappingDrafts(saved), { key: 'draft-1', ...value, sourceFieldPath: 'email', targetFieldPath: 'email' }, { key: 'blank', ...value, sourceFieldPath: '' }]
    assert.deepEqual(protectedDrafts(rows, saved, pairs[0], pairs), [{ ...value, sourceFieldPath: '/email', targetFieldPath: '/email' }])
    assert.deepEqual(canonicalMapping({ ...value, sourceFieldPath: 'customer.id', targetFieldPath: 'client.id' }, pairs), value)
  })
  it('alias ve canonical yolları aynı hedef sayar; kaynak birden çok hedefe bağlanabilir', () => {
    const pairs = mappingPairs({ hasMiddleware: true }, [source, target])
    const draft = { ...suggestion, selected: true }
    assert.ok(suggestionIssues([draft], [{ ...value, targetFieldPath: 'client.id' }], pairs).length)
    assert.equal(suggestionIssues([draft, { ...draft, suggestionId: 'second', targetFieldPath: '/email' }], [], pairs).length, 0)
    assert.ok(suggestionIssues([draft, { ...draft, suggestionId: 'second' }], [], pairs).length)
    assert.ok(suggestionIssues([{ ...draft, targetFieldPath: '/missing' }], [], pairs).some((issue) => issue.includes('örnekte bulunamadı')))
  })
})

describe('Bağımsız hedef örnekleri', () => {
  it('JSON, XML ve IDOC arasındaki dokuz çiftte kaynak ve hedefi aynı ID ile ayrı okur', () => {
    const definitions = { JSON: { customerCode: '000123' }, XML: { kind: 'xml', fields: [{ path: '/Customer/code', type: 'unknown' }] }, IDOC: { kind: 'idoc-xml', fields: [{ path: '/DOC/IDOC/code', type: 'unknown' }] } }
    for (const sourceFormat of ['JSON', 'XML', 'IDOC']) for (const targetFormat of ['JSON', 'XML', 'IDOC']) {
      const item = { ...source, schemaType: 'SOURCE_TO_DEST_REQUEST', format: sourceFormat, schemaDefinition: definitions[sourceFormat], rawContent: '<source/>', targetFormat, targetSchemaDefinition: definitions[targetFormat], targetRawContent: '<target/>' }
      const record = { hasMiddleware: false, formatSource: sourceFormat.toLowerCase(), formatDestination: targetFormat.toLowerCase() }
      const pair = mappingPairs(record, [item])[0]
      assert.equal(pair.source.id, pair.target.id)
      assert.equal(pair.source.format, sourceFormat)
      assert.equal(pair.target.format, targetFormat)
      assert.deepEqual(pair.target.schemaDefinition, definitions[targetFormat])
      assert.equal(schemaContentIssue(record, item), undefined)
    }
  })
  it('JSON hedef örneği/tanımı ayrımını, metin satır sonlarını ve kaynak gövdesini korur', () => {
    assert.deepEqual(targetContent('JSON', '{"clientId":"000123"}'), { targetFormat: 'JSON', targetSamplePayload: { clientId: '000123' } })
    assert.deepEqual(targetContent('JSON', '{"type":"object","properties":{"id":{"type":"string"}}}'), { targetFormat: 'JSON', targetSchemaDefinition: { type: 'object', properties: { id: { type: 'string' } } } })
    assert.deepEqual(targetContent('XML', '<Customer>\r\n<Code>000123</Code></Customer>'), { targetFormat: 'XML', targetRawContent: '<Customer>\r\n<Code>000123</Code></Customer>' })
    assert.deepEqual(contentRequest('SOURCE_TO_DEST_REQUEST', 'JSON', '{"id":1}'), { schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'JSON', schemaDefinition: { id: 1 } })
  })
  it('doğrudan akışta hedef yokken aynı tanımı AI hedefi saymaz; karma formatta hedefi ister', () => {
    const schema = { ...source, schemaType: 'SOURCE_TO_DEST_REQUEST' }
    assert.equal(hasIndependentTarget(schema), false)
    assert.equal(targetSchema(schema), undefined)
    assert.match(schemaContentIssue({ formatSource: 'json', formatDestination: 'xml' }, schema), /hedef örneğini/)
    const record = { id: '30', hasMiddleware: false, formatSource: 'json', formatDestination: 'json', environmentConfigs: [], syncType: 'async' }
    assert.ok(!integrationSteps(record, [schema]).some((step) => step.id === 'mappings'))
    assert.ok(integrationSteps(record, [{ ...schema, targetFormat: 'JSON', targetSamplePayload: { clientId: 42 } }]).some((step) => step.id === 'mappings'))
  })
  it('aynı IDli XML kaynak/hedef ağaçlarının yol kümelerini karıştırmaz', () => {
    const schema = { ...source, format: 'XML', schemaType: 'SOURCE_TO_DEST_REQUEST', schemaDefinition: { kind: 'xml', fields: [{ path: '/Source/id' }] }, targetFormat: 'XML', targetRawContent: '<Target><code>1</code></Target>', targetSchemaDefinition: { kind: 'xml', fields: [{ path: '/Target/code' }] } }
    assert.deepEqual(mappingIssues({ hasMiddleware: false }, [schema], [{ sourceSchemaId: 40, targetSchemaId: 40, sourceFieldPath: '/Source/id', targetFieldPath: '/Target/code' }]), [])
  })
  it('JSON Schema alanlarına bağımsız örnek değerlerini ekler ve boş hedef tanımında örneği gösterir', () => {
    const schema = { ...source, schemaDefinition: { type: 'object', properties: { code: { type: 'string' } } }, samplePayload: { code: '000123' }, targetFormat: 'JSON', targetSchemaDefinition: {}, targetSamplePayload: { id: '000123' } }
    assert.equal(schemaFieldTree(schema).fields[0].sampleValue, '000123')
    assert.equal(JSON.parse(targetText(schema)).id, '000123')
  })
  it('dosya yüklemede hedef içeriğini metadata içinde taşır; kaynak dosyayı tekrar JSONa çevirmez', async () => {
    mock(() => json(source))
    await uploadSchemaSample('30', { schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'JSON', targetFormat: 'XML', targetRawContent: '<Target><id>000123</id></Target>' }, new File(['{"id":"000123"}'], 'source.json'))
    const form = calls.at(-1).body
    assert.deepEqual(JSON.parse(await form.get('metadata').text()), { schemaType: 'SOURCE_TO_DEST_REQUEST', format: 'JSON', targetFormat: 'XML', targetRawContent: '<Target><id>000123</id></Target>' })
    assert.equal(await form.get('file').text(), '{"id":"000123"}')
  })
})

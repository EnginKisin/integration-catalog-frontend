import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrf } from '../src/services/api.ts'
import { downloadSchemaSample, saveSchemaContent, uploadSchemaSample } from '../src/services/integrationsBackend.ts'
import { contentRequest, expectedSchemaFormat, schemaContentIssue, validateSampleFile } from '../src/lib/payload.ts'
import { completionIssues, integrationSteps, resumeStep } from '../src/lib/integrationWorkflow.ts'

const originalFetch = globalThis.fetch
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const type = 'SOURCE_TO_DEST_REQUEST'
let calls
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'payload-test' })
    return handler(url, init)
  }
}
beforeEach(() => { clearCsrf(); calls = [] })
after(() => { globalThis.fetch = originalFetch })

describe('Payload API ve dosya sözleşmesi', () => {
  it('XML metnini ve satır sonlarını rawContent ile; JSONu nesne olarak gönderir', async () => {
    mock((_url, init) => json({ id: 40, ...JSON.parse(init.body) }))
    const xml = '<order>\r\n  <id>42</id>\r\n</order>'
    await saveSchemaContent('30', contentRequest(type, 'XML', xml))
    assert.deepEqual(JSON.parse(calls.at(-1).body), { schemaType: type, format: 'XML', rawContent: xml })
    await saveSchemaContent('30', contentRequest(type, 'JSON', '{"id":42}'))
    assert.deepEqual(JSON.parse(calls.at(-1).body), { schemaType: type, format: 'JSON', schemaDefinition: { id: 42 } })
  })
  it('Excel yüklemesinde JSON metadata parçasını, özgün dosyayı ve CSRFyi korur', async () => {
    mock(() => json({ id: 40, format: 'EXCEL' }))
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'orders.xlsx')
    await uploadSchemaSample('30', { schemaType: type, format: 'EXCEL', rawContent: 'gönderilmemeli', csvOptions: { delimiter: ';', hasHeader: true } }, file)
    const call = calls.at(-1)
    assert.equal(call.url, '/api/v1/integrations/30/mappings/schemas/upload')
    assert.equal(new Headers(call.headers).get('X-CSRF-TOKEN'), 'payload-test')
    assert.equal(new Headers(call.headers).has('Content-Type'), false)
    assert.equal(call.body.get('metadata').type, 'application/json')
    assert.deepEqual(JSON.parse(await call.body.get('metadata').text()), { schemaType: type, format: 'EXCEL' })
    assert.equal(call.body.get('file').name, file.name)
    assert.deepEqual(new Uint8Array(await call.body.get('file').arrayBuffer()), new Uint8Array(await file.arrayBuffer()))
  })
  it('beş formatın dosyalarını kabul eder ve CSV seçeneklerini metadataya ekler', async () => {
    mock(() => json({ id: 40 }))
    for (const [format, name] of [['JSON', 'sample.json'], ['XML', 'sample.xml'], ['IDOC', 'sample.idoc'], ['CSV', 'sample.csv'], ['EXCEL', 'sample.xls']]) {
      await uploadSchemaSample('30', { schemaType: type, format, csvOptions: { delimiter: '\t', hasHeader: false } }, new File(['content'], name))
      const metadata = JSON.parse(await calls.at(-1).body.get('metadata').text())
      assert.equal(metadata.format, format)
      assert.equal('csvOptions' in metadata, format === 'CSV')
      if (format === 'CSV') assert.deepEqual(metadata.csvOptions, { delimiter: '\t', hasHeader: false })
    }
  })
  it('dosyayı JSON ayrıştırmadan özgün baytlarıyla indirir; CSRF istemez', async () => {
    const bytes = new Uint8Array([0, 255, 128, 10])
    mock(() => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }))
    const blob = await downloadSchemaSample('30', 40)
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].credentials, 'include')
    assert.equal(calls[0].url, '/api/v1/integrations/30/mappings/schemas/40/sample')
  })
  it('indirme 404ünü ve yükleme hata kodunu korur; yazmayı otomatik tekrarlamaz', async () => {
    mock(() => json({ message: 'Dosya yok' }, 404))
    await assert.rejects(downloadSchemaSample('30', 40), (error) => error.status === 404)
    mock(() => json({ message: 'Mapping conflict', code: 'SCHEMA_MAPPING_CONFLICT' }, 409))
    await assert.rejects(uploadSchemaSample('30', { schemaType: type, format: 'XML' }, new File(['<new/>'], 'sample.xml')), (error) => error.status === 409 && error.code === 'SCHEMA_MAPPING_CONFLICT')
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('JSON olmayan 413 yanıtını açıklayıcı bir boyut hatası olarak gösterir', async () => {
    mock(() => new Response('<html>too large</html>', { status: 413 }))
    await assert.rejects(saveSchemaContent('30', contentRequest(type, 'CSV', 'id\n42\n')), (error) => error.status === 413 && error.message.includes('boyut sınırını'))
  })
})

describe('Formatlara göre tamamlama ve adım ilerlemesi', () => {
  const record = (changes = {}) => ({ hasMiddleware: false, syncType: 'async', formatSource: 'csv', formatDestination: 'excel', reviewRequired: false, status: 'DRAFT', environmentConfigs: [{ environmentType: 'DEV', configTarget: 'DESTINATION' }], ...changes })
  const sample = (schemaType, format, id = 40) => ({ id, schemaType, format, schemaDefinition: {}, mappingSupported: false, fileName: format === 'CSV' ? 'sample.csv' : 'sample.xlsx', fileSize: 100, sampleDownloadUrl: `/samples/${id}` })
  it('doğrudan CSV/Excel istek ve yanıtını eşleme olmadan tamamlanabilir sayar', () => {
    const item = record({ syncType: 'sync' })
    const schemas = [sample(type, 'CSV'), sample('DEST_TO_SOURCE_RESPONSE', 'EXCEL', 41)]
    assert.deepEqual(completionIssues(item, schemas), [])
    assert.equal(resumeStep(item, schemas), 'review')
    assert.equal(integrationSteps(item, schemas).find((step) => step.id === 'schemas').detail, '2/2 zorunlu yapı kayıtlı')
    assert.ok(!integrationSteps(item, schemas).some((step) => step.id === 'mappings'))
  })
  it('ara katmanda senkron dört örneği kaynak/hedef formatına göre doğrular', () => {
    const item = record({ hasMiddleware: true, syncType: 'sync', environmentConfigs: [{ environmentType: 'DEV', configTarget: 'DESTINATION' }, { environmentType: 'DEV', configTarget: 'MIDDLEWARE' }] })
    const schemas = [sample('SOURCE_TO_MW_REQUEST', 'CSV'), sample('MW_TO_DEST_REQUEST', 'EXCEL', 41), sample('DEST_TO_MW_RESPONSE', 'EXCEL', 42), sample('MW_TO_SOURCE_RESPONSE', 'CSV', 43)]
    assert.deepEqual(completionIssues(item, schemas), [])
    assert.equal(integrationSteps(item, schemas).find((step) => step.id === 'schemas').detail, '4/4 zorunlu yapı kayıtlı')
    assert.ok(completionIssues(item, schemas.slice(0, 3)).some((issue) => issue.includes('Ara katman → Kaynak')))
  })
  it('asenkron isteğe bağlı yanıt mevcutsa boş veya yanlış formatı da bildirir', () => {
    const item = record()
    const request = sample(type, 'CSV')
    assert.deepEqual(completionIssues(item, [request]), [])
    assert.ok(completionIssues(item, [request, { id: 41, schemaType: 'DEST_TO_SOURCE_RESPONSE', format: 'JSON', schemaDefinition: {} }]).some((issue) => issue.includes('EXCEL örneğini yeniden kaydedin')))
    assert.ok(completionIssues(item, [request, { ...sample('DEST_TO_SOURCE_RESPONSE', 'EXCEL', 41), fileSize: 0 }]).some((issue) => issue.includes('örnek dosya eksik')))
  })
  it('CSV/Excelden kalan geçersiz bağlantıları doğrudan akışta özette, ara katmanda eşleme adımında gösterir', () => {
    for (const hasMiddleware of [false, true]) {
      const item = record({ hasMiddleware, environmentConfigs: [{ environmentType: 'DEV', configTarget: 'DESTINATION' }, ...(hasMiddleware ? [{ environmentType: 'DEV', configTarget: 'MIDDLEWARE' }] : [])] })
      const schemas = hasMiddleware ? [sample('SOURCE_TO_MW_REQUEST', 'CSV'), sample('MW_TO_DEST_REQUEST', 'EXCEL', 41)] : [sample(type, 'CSV')]
      const mappings = [{ sourceSchemaId: 40, sourceFieldPath: 'id', targetSchemaId: hasMiddleware ? 41 : 40, targetFieldPath: 'id' }]
      const step = hasMiddleware ? 'mappings' : 'review'
      assert.equal(resumeStep(item, schemas, mappings), step)
      assert.ok(integrationSteps(item, schemas, mappings).find((item) => item.id === step).issues.some((issue) => issue.includes('CSV/Excel')))
      assert.deepEqual(completionIssues(item, schemas, []), [])
    }
  })
})

describe('Format, metin ve dosya doğrulama', () => {
  it('istek ve ters yanıt yönlerini kaynak/hedef formatına bağlar', () => {
    const record = { formatSource: 'idoc', formatDestination: 'excel' }
    for (const schemaType of ['SOURCE_TO_DEST_REQUEST', 'SOURCE_TO_MW_REQUEST', 'MW_TO_SOURCE_RESPONSE']) assert.equal(expectedSchemaFormat(record, schemaType), 'IDOC')
    for (const schemaType of ['DEST_TO_SOURCE_RESPONSE', 'MW_TO_DEST_REQUEST', 'DEST_TO_MW_RESPONSE']) assert.equal(expectedSchemaFormat(record, schemaType), 'EXCEL')
  })
  it('CSV metnini kırpmaz; başlık ve ayırıcı seçeneklerini korur', () => {
    const text = 'id;name\r\n42; Örnek \r\n'
    assert.deepEqual(contentRequest(type, 'CSV', text, { delimiter: ';', hasHeader: false }), { schemaType: type, format: 'CSV', rawContent: text, csvOptions: { delimiter: ';', hasHeader: false } })
    assert.throws(() => contentRequest(type, 'CSV', text, { delimiter: ';;', hasHeader: true }), /tek karakter/)
  })
  it('metin boyutunu UTF-8 baytlarıyla ölçer; nesne dışı JSONu reddeder', () => {
    assert.throws(() => contentRequest(type, 'XML', 'ş'.repeat(524289)), /1 MiB/)
    for (const text of ['[]', 'null', '42']) assert.throws(() => contentRequest(type, 'JSON', text), /JSON nesnesi/)
    assert.throws(() => contentRequest(type, 'EXCEL', 'text'), /dosyası seçin/)
  })
  it('yanlış uzantı ve limit üstü dosyalarda ağ isteği göndermez', () => {
    assert.throws(() => uploadSchemaSample('30', { schemaType: type, format: 'CSV' }, new File(['data'], 'wrong.xlsx')), /uzantılı/)
    assert.throws(() => validateSampleFile({ name: 'big.csv', size: 1048577 }, 'CSV'), /1.0 MiB/)
    assert.throws(() => validateSampleFile({ name: 'big.xlsx', size: 5242881 }, 'EXCEL'), /5.0 MiB/)
    assert.doesNotThrow(() => validateSampleFile({ name: 'valid.XLSX', size: 5242880 }, 'EXCEL'))
    assert.equal(calls.length, 0)
  })
  it('CSV/Excel için boş schemaDefinition geçerlidir; eski JSON içeriğinde format uyumsuzluğunu bildirir', () => {
    const record = { formatSource: 'excel', formatDestination: 'csv' }
    assert.equal(schemaContentIssue(record, { id: 40, schemaType: type, format: 'EXCEL', schemaDefinition: {}, fileName: 'orders.xlsx', fileSize: 4096, sampleDownloadUrl: '/sample' }), undefined)
    assert.match(schemaContentIssue(record, { id: 40, schemaType: type, schemaDefinition: { id: 42 } }), /JSON olarak kayıtlı; EXCEL/)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { completionIssues, integrationSteps, resumeStep } from '../src/lib/integrationWorkflow.ts'
import { credentialText, credentialValues } from '../src/lib/credentials.ts'

const config = (changes = {}) => ({ environmentType: 'DEV', configTarget: 'DESTINATION', url: 'https://example.test', authType: 'NONE', credentialsConfigured: false, ...changes })
const record = (changes = {}) => ({ id: '30', serviceName: 'Sipariş', sourceSystemId: 1, destinationSystemId: 2, hasMiddleware: false, syncType: 'async', formatSource: 'json', formatDestination: 'json', status: 'DRAFT', reviewRequired: false, environmentConfigs: [], ...changes })
const schema = (type, id = 40) => ({ id, schemaType: type, schemaDefinition: { orderId: '123' } })
const mapping = (sourceSchemaId, targetSchemaId) => ({ id: 1, sourceSchemaId, targetSchemaId, sourceFieldPath: 'orderId', targetFieldPath: 'orderId', isAiGenerated: false, aiConfidenceScore: null })

describe('Entegrasyona devam etme ve adım ilerlemesi', () => {
  it('yeni taslağı ortamlarda, ortamı kayıtlı taslağı veri yapılarında açar', () => {
    assert.equal(resumeStep(record(), []), 'configs')
    assert.equal(resumeStep(record({ environmentConfigs: [config()] }), []), 'schemas')
  })
  it('doğrudan asenkron akışta yanıt veya alan eşlemesi istemez', () => {
    const item = record({ environmentConfigs: [config()] })
    const schemas = [schema('SOURCE_TO_DEST_REQUEST')]
    const steps = integrationSteps(item, schemas)
    assert.deepEqual(steps.map((step) => step.id), ['basics', 'configs', 'schemas', 'review'])
    assert.ok(steps.every((step) => step.issues.length === 0))
    assert.equal(steps.find((step) => step.id === 'schemas').detail, '1/1 zorunlu yapı kayıtlı')
    assert.equal(resumeStep(item, schemas), 'review')
  })
  it('senkron akışta boş yanıtı tamamlanmış saymaz', () => {
    const item = record({ syncType: 'sync', environmentConfigs: [config()] })
    const schemas = [schema('SOURCE_TO_DEST_REQUEST'), { ...schema('DEST_TO_SOURCE_RESPONSE', 41), schemaDefinition: {} }]
    assert.equal(resumeStep(item, schemas), 'schemas')
    assert.equal(integrationSteps(item, schemas).find((step) => step.id === 'schemas').detail, '1/2 zorunlu yapı kayıtlı')
  })
  it('doğrudan senkron akışta kayıtlı eşlemeler olsa da eşleme adımını göstermez', () => {
    const item = record({ syncType: 'sync', environmentConfigs: [config()] })
    const schemas = [schema('SOURCE_TO_DEST_REQUEST'), schema('DEST_TO_SOURCE_RESPONSE', 41)]
    const mappings = [mapping(40, 40), mapping(41, 41)]
    assert.deepEqual(integrationSteps(item, schemas, mappings).map((step) => step.id), ['basics', 'configs', 'schemas', 'review'])
    assert.equal(resumeStep(item, schemas, mappings), 'review')
    assert.deepEqual(completionIssues(item, schemas, mappings), [])
  })
  it('ara katmanın ortam gereksinimlerini gösterir; isteğe bağlı eşleme devam etmeyi engellemez', () => {
    const item = record({ hasMiddleware: true, environmentConfigs: [config()] })
    const schemas = [schema('SOURCE_TO_MW_REQUEST'), schema('MW_TO_DEST_REQUEST', 41)]
    assert.equal(resumeStep(item, schemas), 'configs')
    const configured = { ...item, environmentConfigs: [config(), config({ configTarget: 'MIDDLEWARE' })] }
    assert.ok(integrationSteps(configured, schemas).some((step) => step.id === 'mappings'))
    assert.equal(resumeStep(configured, schemas), 'review')
    assert.equal(resumeStep(configured, schemas, [mapping(40, 41)]), 'review')
  })
  it('inceleme gereksinimini özette, geçersiz eşlemeleri eşleme adımında gösterir', () => {
    const item = record({ hasMiddleware: true, reviewRequired: true, environmentConfigs: [config(), config({ configTarget: 'MIDDLEWARE' })] })
    const schemas = [schema('SOURCE_TO_MW_REQUEST'), schema('MW_TO_DEST_REQUEST', 41)]
    const mappings = [mapping(40, 99)]
    const steps = integrationSteps(item, schemas, mappings)
    assert.equal(steps.find((step) => step.id === 'schemas').issues.length, 0)
    assert.equal(steps.find((step) => step.id === 'review').issues.length, 1)
    assert.equal(steps.find((step) => step.id === 'mappings').issues.length, 1)
    assert.equal(resumeStep(item, schemas, mappings), 'mappings')
  })
  it('doğrudan akışta geçersiz eski eşlemeleri özette gösterir ve verileri korur', () => {
    const item = record({ environmentConfigs: [config()] })
    const schemas = [schema('SOURCE_TO_DEST_REQUEST')]
    const mappings = [mapping(40, 99)]
    const steps = integrationSteps(item, schemas, mappings)
    assert.ok(steps.every((step) => step.id !== 'mappings'))
    assert.match(steps.find((step) => step.id === 'review').issues[0], /Şema çifti/)
    assert.equal(resumeStep(item, schemas, mappings), 'review')
    assert.equal(mappings.length, 1)
  })
  it('adımlardaki eksikler tamamlama kontrolüyle aynı kalır', () => {
    for (const hasMiddleware of [false, true]) for (const syncType of ['async', 'sync']) {
      const item = record({ hasMiddleware, syncType, reviewRequired: true, environmentConfigs: [config(), config({ environmentType: 'TEST', configTarget: 'MIDDLEWARE' })] })
      const schemas = [schema('SOURCE_TO_DEST_REQUEST')]
      const mappings = [mapping(99, 100)]
      assert.deepEqual(integrationSteps(item, schemas, mappings).flatMap((step) => step.issues).sort(), completionIssues(item, schemas, mappings).sort())
    }
  })
  it('tamamlanmış kaydı temel bilgilerde açar ve durumunu değiştirmez', () => {
    const item = record({ status: 'COMPLETED' })
    assert.equal(resumeStep(item, []), 'basics')
    assert.equal(item.status, 'COMPLETED')
  })
})

describe('Erişim bilgisi formu ve özel JSON alanları', () => {
  it('boş formu boş bırakır; kayıtlı secret için maske veya boş nesne üretmez', () => {
    assert.equal(credentialText({ username: '', password: '' }), '')
    assert.deepEqual(credentialValues('BASIC_AUTH', ''), {})
  })
  it('parola ve anahtarların boşluklarını veya özel karakterlerini değiştirmez', () => {
    const values = { username: 'example', password: '  p@ss"\\\n  ' }
    assert.deepEqual(credentialValues('BASIC_AUTH', credentialText(values)), values)
    assert.deepEqual(credentialValues('API_KEY', credentialText({ apiKey: ' key ' })), { apiKey: ' key ' })
  })
  it('OAuth alanlarını ve isteğe bağlı kapsamı JSON sözleşmesine taşır', () => {
    const values = { clientId: 'client', clientSecret: 'secret', tokenUrl: 'https://example.test/token', scope: 'read write' }
    assert.deepEqual(credentialValues('OAUTH2', credentialText(values)), values)
  })
  it('özel alanları ve iç içe nesneleri form moduna geçerken sessizce silmez', () => {
    for (const value of [{ apiKey: 'key', headerName: 'X-Key' }, { apiKey: { value: 'key' } }, { apiKey: 123 }]) {
      assert.throws(() => credentialValues('API_KEY', JSON.stringify(value)), /özel alanlar/)
    }
    assert.throws(() => credentialValues('API_KEY', '{broken'))
    assert.throws(() => credentialValues('API_KEY', '[]'))
  })
})

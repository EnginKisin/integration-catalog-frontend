import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrf } from '../src/services/api.ts'
import { createSystem, deleteSystem, fetchSelectableSystems, fetchSystem, listSystems, setSystemActive, updateSystem } from '../src/services/systemsBackend.ts'
import { createIntegration, fetchIntegrations } from '../src/services/integrationsBackend.ts'
import { systemLabel, selectableSystems } from '../src/lib/catalog.ts'

const originalFetch = globalThis.fetch
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const system = (id, name = 'ERP', active = true, usageCount = 0) => ({ id, name, description: '', active, usageCount })
let calls
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url === '/api/v1/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'catalog-test' })
    return handler(url, init)
  }
}
beforeEach(() => { clearCsrf(); calls = [] })
after(() => { globalThis.fetch = originalFetch })

describe('Ortak sistem kataloğu ve rol seçimleri', () => {
  it('ortak katalogda kimlik, aktiflik ve kullanım sayısını korur', async () => {
    const item = system(4, 'ERP', false, 7)
    mock(() => json([item]))
    assert.deepEqual(await listSystems(), [item])
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/systems'])
  })
  it('yeni entegrasyonun bütün rolleri için aktif sistemleri tek istekle alır', async () => {
    mock(() => json([system(1)]))
    assert.deepEqual(await fetchSelectableSystems(), [system(1)])
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/systems?active=true'])
  })
  it('düzenlemede eksik mevcut sistemleri detaydan alır; aynı kimliği bir kez ister', async () => {
    mock((url) => json(url.endsWith('/9') ? system(9, 'Eski sistem', false, 2) : [system(1)]))
    const choices = await fetchSelectableSystems([9, 1, 9, null, undefined])
    assert.deepEqual(choices.map((item) => item.id), [1, 9])
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/systems?active=true', '/api/v1/systems/9'])
    assert.deepEqual(selectableSystems(choices, 9).map((item) => item.id), [1, 9])
    assert.deepEqual(selectableSystems(choices, 1).map((item) => item.id), [1])
  })
  it('pasif liste ve tekil detay endpointlerini destekler', async () => {
    mock((url) => json(url.endsWith('/9') ? system(9, 'Eski sistem', false, 2) : []))
    await listSystems(false)
    const item = await fetchSystem(9)
    assert.equal(calls[0].url, '/api/v1/systems?active=false')
    assert.equal(calls[1].url, '/api/v1/systems/9')
    assert.equal(item.active, false)
    assert.equal(item.usageCount, 2)
  })
  it('oluşturmada yalnızca name/description gönderir; rol veya aktiflik yazmaz', async () => {
    mock(() => json(system(21), 201))
    const created = await createSystem({ name: '  ERP  ', description: '', active: false, usageCount: 99, role: 'source' })
    const write = calls.find((call) => call.method === 'POST')
    assert.equal(write.url, '/api/v1/systems')
    assert.deepEqual(JSON.parse(write.body), { name: 'ERP', description: '' })
    assert.equal(created.id, 21)
    assert.equal(created.active, true)
    assert.equal(new Headers(write.headers).get('X-CSRF-TOKEN'), 'catalog-test')
  })
  it('güncellemeyi seçili kimliğe PUT eder; aynı isimli başka kaydı değiştirmez', async () => {
    mock(() => json(system(52, 'Yeni isim', false, 8)))
    const saved = await updateSystem(52, { name: 'Yeni isim', description: 'açıklama', id: 1, active: true })
    const write = calls.find((call) => call.method === 'PUT')
    assert.equal(write.url, '/api/v1/systems/52')
    assert.deepEqual(JSON.parse(write.body), { name: 'Yeni isim', description: 'açıklama' })
    assert.equal(saved.id, 52)
    assert.equal(saved.active, false)
    assert.equal(saved.usageCount, 8)
  })
  it('pasifleştirme ve aktifleştirmede PATCH /active kullanır', async () => {
    mock((url, init) => json(system(3, 'ERP', JSON.parse(init.body).active, 6)))
    assert.equal((await setSystemActive(3, false)).active, false)
    assert.equal((await setSystemActive(3, true)).active, true)
    const writes = calls.filter((call) => call.method === 'PATCH')
    assert.ok(writes.every((call) => call.url === '/api/v1/systems/3/active'))
    assert.deepEqual(writes.map((call) => JSON.parse(call.body)), [{ active: false }, { active: true }])
  })
  it('kullanılmayan sistemi kimlikle siler ve boş 204 yanıtını işler', async () => {
    mock(() => new Response(null, { status: 204 }))
    assert.equal(await deleteSystem(8), undefined)
    assert.equal(calls.at(-1).url, '/api/v1/systems/8')
    assert.equal(calls.at(-1).method, 'DELETE')
  })
  it('kullanım sayısı sonradan değiştiğinde 409u korur ve silmeyi tekrarlamaz', async () => {
    mock(() => json({ code: 'SYSTEM_IN_USE', message: 'System is used by 1 integration(s); deactivate it instead', params: { usageCount: 1 } }, 409))
    await assert.rejects(deleteSystem(5), (error) => error.status === 409 && error.code === 'SYSTEM_IN_USE' && error.message.includes('pasifleştirebilirsiniz'))
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1)
  })
  it('aynı adlı sistemlerin kimliklerini korur, etikette yalnızca adı gösterir; sadece mevcut pasif rolü korur', () => {
    const items = [system(1), system(2, 'ERP', false), system(3, 'Başka', false), system(4)]
    assert.deepEqual(selectableSystems(items).map((item) => item.id), [1, 4])
    assert.deepEqual(selectableSystems(items, 2).map((item) => item.id), [1, 2, 4])
    assert.equal(systemLabel(items[0]), 'ERP')
    assert.equal(systemLabel(items[3]), 'ERP')
    assert.equal(systemLabel(items[1]), 'ERP — Pasif, mevcut seçim')
  })
  it('liste yanıtındaki sistem adlarını ve ortam türlerini katalog sorgulamadan kullanır', async () => {
    mock((url) => {
      assert.equal(url, '/api/v1/integrations')
      return json([{ id: 100, name: 'Kayıt', sourceSystemId: 2, sourceSystemName: 'Pasif sistem', destinationSystemId: 2, destinationSystemName: 'Pasif sistem', middlewareSystemId: null, hasMiddleware: false, environmentTypes: ['DEV', 'PROD'] }])
    })
    const [record] = await fetchIntegrations()
    assert.equal(record.sourceSystemId, 2)
    assert.equal(record.destinationSystemId, 2)
    assert.equal(record.sourceSystem, 'Pasif sistem')
    assert.equal(record.destinationSystem, 'Pasif sistem')
    assert.deepEqual(record.environmentTypes, ['DEV', 'PROD'])
    assert.equal(calls.length, 1)
  })
  it('yeni ID alanlarını gönderir; doğrudan akışta ara katmanı null yapar ve adları korur', async () => {
    mock((url, init) => {
      assert.equal(url, '/api/v1/integrations')
      return json({ id: 70, ...JSON.parse(init.body), sourceSystemName: 'ERP', destinationSystemName: 'CRM', middlewareSystemName: null, environmentTypes: [] }, 201)
    })
    const record = await createIntegration({ sourceSystemId: 22, destinationSystemId: 45, middlewareSystemId: 99, hasMiddleware: false, serviceName: 'Kayıt', formatSource: 'json', formatDestination: 'json', syncType: 'async' })
    const input = JSON.parse(calls.find((call) => call.method === 'POST').body)
    assert.equal(input.sourceSystemId, 22)
    assert.equal(input.destinationSystemId, 45)
    assert.equal(input.middlewareSystemId, null)
    assert.deepEqual(Object.keys(input).sort(), ['name', 'description', 'sourceSystemId', 'destinationSystemId', 'middlewareSystemId', 'sourcePayloadFormat', 'destinationPayloadFormat', 'isSync', 'hasMiddleware'].sort())
    assert.equal(record.sourceSystem, 'ERP')
    assert.equal(record.destinationSystem, 'CRM')
  })
  it('aynı sistemi üç rolde de kabul eder; geçersiz kimlikte istek göndermez', async () => {
    const base = { sourceSystemId: 8, destinationSystemId: 8, hasMiddleware: true, middlewareSystemId: 8, serviceName: 'Kayıt', formatSource: 'json', formatDestination: 'json', syncType: 'async' }
    mock((url, init) => json({ id: 90, ...JSON.parse(init.body), sourceSystemName: 'ERP', destinationSystemName: 'ERP', middlewareSystemName: 'ERP' }, 201))
    const saved = await createIntegration(base)
    assert.equal(saved.middlewareSystemId, 8)
    assert.equal(saved.middleware, 'ERP')
    calls = []
    for (const invalid of [{ ...base, middlewareSystemId: null }, { ...base, sourceSystemId: NaN }, { ...base, destinationSystemId: -1 }, { ...base, sourceSystemId: 1.5 }]) await assert.rejects(createIntegration(invalid), /Aktif kaynak/)
    assert.equal(calls.length, 0)
  })
})

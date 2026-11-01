import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { emptyFlowFilters, filterFlows, flowMapSvg, flowSystems, flowSystemCount, flowFilterSummary, layoutFlows, flowComponents } from '../src/lib/flowMap.ts'

const record = (changes = {}) => ({ id: '30', serviceName: 'Sipariş aktarımı', description: '', sourceSystemId: 1, sourceSystem: 'ERP', destinationSystemId: 2, destinationSystem: 'CRM', middlewareSystemId: 3, middleware: 'ESB', hasMiddleware: true, syncType: 'sync', formatSource: 'json', formatDestination: 'xml', status: 'DRAFT', reviewRequired: false, environmentTypes: ['TEST'], environmentConfigs: [], lastUpdated: '—', ...changes })
const records = [record(), record({ id: '31', serviceName: 'Stok sorgulama', destinationSystemId: 4, destinationSystem: 'Depo', hasMiddleware: false, middlewareSystemId: null, syncType: 'async', status: 'COMPLETED', environmentTypes: ['PROD'] }), record({ id: '32', serviceName: 'Müşteri aktarımı', sourceSystemId: 5, sourceSystem: 'ERP', status: 'COMPLETED' })]
const filter = (changes) => filterFlows(records, { ...emptyFlowFilters, ...changes }).map((item) => item.id).sort()

describe('Akış haritası', () => {
  it('kaynak, hedef ve ara katman filtrelerini aynı kayıt üzerinde birleştirir', () => {
    assert.deepEqual(filter({ source: '1' }), ['30', '31'])
    assert.deepEqual(filter({ source: '1', destination: '2' }), ['30'])
    assert.deepEqual(filter({ middleware: '3' }), ['30', '32'])
    assert.deepEqual(filter({ source: '1', middleware: '3', integration: '32' }), [])
  })
  it('ara katmansız kayıttaki eski ara katman alanlarını bağlantı kabul etmez', () => {
    assert.deepEqual(filter({ middleware: 'none' }), ['31'])
    assert.deepEqual(flowSystems([records[1]], 'middleware'), [])
    assert.equal(flowMapSvg([records[1]]).includes('data-system-role="middleware"'), false)
    assert.ok(flowMapSvg([records[1]]).includes('Doğrudan bağlantı'))
  })
  it('tek entegrasyon, ortam, akış türü ve kayıt durumunu filtreler', () => {
    assert.deepEqual(filter({ integration: '32' }), ['32'])
    assert.deepEqual(filter({ environment: 'PROD', sync: 'async', status: 'COMPLETED' }), ['31'])
    assert.deepEqual(filter({ environment: 'PROD', status: 'DRAFT' }), [])
  })
  it('aynı isimli farklı sistemleri kimlikleriyle ayırır; benzersiz sistemleri sayar', () => {
    assert.deepEqual(flowSystems(records, 'source').map((item) => item.id), [1, 5])
    assert.deepEqual(filter({ source: '5' }), ['32'])
    assert.equal(flowSystemCount(records), 5)
  })
  it('Türkçe arama yapar ve çıktı özeti seçilen filtreleri açıklar', () => {
    assert.deepEqual(filter({ query: 'SİPARİŞ' }), ['30'])
    const summary = flowFilterSummary(records, { ...emptyFlowFilters, source: '1', environment: 'TEST', middleware: '3' })
    assert.match(summary, /Kaynak: ERP/)
    assert.match(summary, /Ara katman: ESB/)
    assert.match(summary, /Ortam: TEST/)
  })
  it('ortak ara katmanı tek kutuda gösterir, her entegrasyonun iki bacağını korur', () => {
    const svg = flowMapSvg(records.filter((item) => item.hasMiddleware), { interactive: true })
    assert.equal((svg.match(/data-flow-id=/g) ?? []).length, 2)
    assert.equal((svg.match(/data-system-role="middleware"/g) ?? []).length, 1)
    assert.ok(svg.includes('data-flow-id="30"'))
    assert.ok(svg.includes('data-flow-id="32"'))
  })
  it('beş entegrasyon tek büyük ara katmandan farklı portlarla geçer', () => {
    const five = Array.from({ length: 5 }, (_, index) => record({ id: String(100 + index) }))
    const layout = layoutFlows(five)
    assert.equal(layout.nodes.length, 3)
    const hub = layout.nodes.find((node) => node.role === 'middleware')
    assert.equal(hub.records.length, 5)
    assert.ok(hub.height > layoutFlows([five[0]]).nodes.find((node) => node.role === 'middleware').height)
    assert.equal(new Set(layout.routes.map((route) => route.middlewareY)).size, 5)
    for (const route of layout.routes) {
      assert.ok(route.middlewareY > hub.y && route.middlewareY < hub.y + hub.height)
      assert.ok(route.path.includes(`370 ${route.middlewareY} H630`))
    }
  })
  it('aynı adlı farklı ara katmanları ayırır ve doğrudan yolları kutuların dışından geçirir', () => {
    const items = [record(), record({ id: '99', middlewareSystemId: 9 }), records[1]]
    const layout = layoutFlows(items)
    const hubs = layout.nodes.filter((node) => node.role === 'middleware')
    assert.equal(hubs.length, 2)
    const direct = layout.routes.find((route) => route.record.id === '31')
    assert.equal(direct.middlewareY, undefined)
    assert.ok(direct.labelY > Math.max(...hubs.map((node) => node.y + node.height)))
    assert.ok(Number.isFinite(layout.height))
  })
  it('PDF gruplamasında aynı ara katmanı veya sistemi paylaşan akışları ayırmaz', () => {
    const independent = record({ id: '80', sourceSystemId: 80, destinationSystemId: 81, middlewareSystemId: 82 })
    const groups = flowComponents([...records, independent])
    assert.equal(groups.length, 2)
    assert.deepEqual(groups[0].map((item) => item.id), ['30', '31', '32'])
    assert.deepEqual(groups[1].map((item) => item.id), ['80'])
  })
  it('sistem, servis ve filtre metinlerini SVG içine XML olarak kaçırır', () => {
    const unsafe = '<script>alert("x")</script><image onload="bad()"/>'
    const svg = flowMapSvg([record({ id: '" onload="bad()', serviceName: unsafe, sourceSystem: unsafe })], { interactive: true, report: { summary: unsafe, date: '31.10.2026' } })
    assert.ok(svg.includes('&lt;script&gt;'))
    assert.ok(!svg.includes('<script>'))
    assert.ok(!svg.includes('<image'))
    assert.ok(!svg.includes(' onload="bad()"'))
  })
  it('raporda tarih ve filtreleri taşır, etkileşimli kontrolleri dışarı aktarmaz', () => {
    const svg = flowMapSvg(records, { report: { date: '31.10.2026 21:30', summary: 'Tüm entegrasyonlar' } })
    assert.match(svg, /31.10.2026 21:30/)
    assert.match(svg, /Tüm entegrasyonlar/)
    assert.ok(!svg.includes('tabindex='))
    for (const item of records) assert.ok(svg.includes(item.serviceName))
  })
})

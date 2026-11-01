import { useEffect, useMemo, useRef, useState } from 'react'
import type { IntegrationRecord } from '../../types/integration'
import type { FlowFilters } from '../../lib/flowMap'
import { emptyFlowFilters, filterFlows, flowFilterSummary, flowHeight, flowMapSvg, flowSystemCount, flowSystems, FLOW_WIDTH } from '../../lib/flowMap'
import { exportFlowMap, printFlowMap } from '../../lib/flowMapExport'
import { useTask } from '../../hooks/useRequest'
import { AppIcon } from '../ui/AppIcon'
import { EmptyState, PageHeader } from '../ui/PageLayout'
import { ErrorPanel, Loading, TaskFeedback } from '../ui/feedback'
import './flow-map.css'

interface Props {
  records: IntegrationRecord[]
  loading: boolean
  error?: Error
  filters: FlowFilters
  onFiltersChange: (filters: FlowFilters) => void
  onReload: () => void
  onOpenIntegration: (id: string) => void
}

export function FlowMapPage({ records, loading, error, filters, onFiltersChange, onReload, onOpenIntegration }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [zoom, setZoom] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const exportTask = useTask()
  const filtered = useMemo(() => filterFlows(records, filters), [records, filters])
  const options = useMemo(() => ({ source: flowSystems(records, 'source'), destination: flowSystems(records, 'destination'), middleware: flowSystems(records, 'middleware') }), [records])
  const summary = useMemo(() => flowFilterSummary(records, filters), [records, filters])
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0]
  const scale = zoom ?? Math.min(1, Math.max(0.75, (viewportWidth - 24) / FLOW_WIDTH))
  const svg = useMemo(() => flowMapSvg(filtered, { selectedId: selected?.id, interactive: true }), [filtered, selected?.id])
  const diagramHeight = useMemo(() => flowHeight(filtered), [filtered])
  const hasFilters = Object.values(filters).some((value) => value.trim())
  const unavailable = loading || Boolean(error)
  const exportDisabled = unavailable || !filtered.length || exportTask.busy

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width) setViewportWidth(entry.contentRect.width) })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [unavailable, filtered.length === 0])

  const changeFilter = (field: keyof FlowFilters, value: string) => {
    onFiltersChange({ ...filters, [field]: value })
    setSelectedId('')
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }
  const clearFilters = () => { onFiltersChange({ ...emptyFlowFilters }); setSelectedId('') }
  const selectFlow = (target: EventTarget | null, keyboard = false) => {
    if (target instanceof Element) {
      const id = target.closest('[data-flow-id]')?.getAttribute('data-flow-id')
      if (id) {
        setSelectedId(id)
        if (keyboard) window.requestAnimationFrame(() => viewportRef.current?.querySelector<SVGElement>(`[data-flow-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }))
      }
    }
  }
  const chooseFlow = (id: string) => {
    setSelectedId(id)
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current
      const label = viewport?.querySelector(`[data-flow-id="${CSS.escape(id)}"] .flow-route-label`)
      if (!viewport || !label) return
      const rect = label.getBoundingClientRect()
      const bounds = viewport.getBoundingClientRect()
      viewport.scrollTo({ top: viewport.scrollTop + rect.top - bounds.top - viewport.clientHeight / 2 + rect.height / 2, left: viewport.scrollLeft + rect.left - bounds.left - viewport.clientWidth / 2 + rect.width / 2 })
    })
  }
  const exportImage = (format: 'svg' | 'png') => void exportTask.run(() => exportFlowMap(filtered, summary, format), `${filtered.length} akış için ${format.toUpperCase()} dosyası hazırlandı.`)

  return <div className="app-page flow-map-page">
    <PageHeader eyebrow="SİSTEMLER VE BAĞLANTILAR" title="Akış Haritası" description="Bir sistemden çıkan akışları, iki sistem arasındaki servisleri veya bir ara katmanın tüm bağlantılarını keşfedin." actions={<>
      <button type="button" className="btn" disabled={loading} onClick={onReload}><AppIcon name="refresh" />Yenile</button>
      <button type="button" className="btn" disabled={exportDisabled} onClick={() => exportImage('svg')}><AppIcon name="download" />SVG</button>
      <button type="button" className="btn" disabled={exportDisabled} onClick={() => exportImage('png')}><AppIcon name="download" />PNG</button>
      <button type="button" className="btn-primary" disabled={exportDisabled} onClick={() => printFlowMap(filtered, summary)}><AppIcon name="print" />PDF / Yazdır</button>
    </>} />

    <section className="flow-filters" aria-label="Akış haritası filtreleri">
      <div className="flow-filter-heading"><span><AppIcon name="filter" />Görmek istediğiniz akışları seçin</span>{hasFilters && <button type="button" className="flow-text-button" onClick={clearFilters}>Filtreleri temizle</button>}</div>
      <div className="flow-primary-filters">
        {(['source', 'destination', 'middleware'] as const).map((role) => <label className="label" key={role}>{role === 'source' ? 'Kaynak sistem' : role === 'destination' ? 'Hedef sistem' : 'Ara katman'}
          <select className="field" aria-label={role === 'source' ? 'Kaynak sistem' : role === 'destination' ? 'Hedef sistem' : 'Ara katman'} value={filters[role]} onChange={(event) => changeFilter(role, event.target.value)}>
            <option value="">{role === 'source' ? 'Tüm kaynaklar' : role === 'destination' ? 'Tüm hedefler' : 'Tüm bağlantılar'}</option>
            {role === 'middleware' && <option value="none">Ara katmansız</option>}
            {options[role].map((system) => <option value={system.id} key={system.id}>{system.name} · #{system.id}</option>)}
          </select>
        </label>)}
        <label className="label">Entegrasyon<select className="field" aria-label="Entegrasyon" value={filters.integration} onChange={(event) => changeFilter('integration', event.target.value)}><option value="">Tüm entegrasyonlar</option>{[...records].sort((a, b) => a.serviceName.localeCompare(b.serviceName, 'tr')).map((record) => <option key={record.id} value={record.id}>{record.serviceName} · #{record.id}</option>)}</select></label>
      </div>
      <div className="flow-secondary-filters">
        <label className="flow-search"><AppIcon name="search" /><input className="field" aria-label="Akışlarda ara" type="search" placeholder="Servis, sistem veya ID ara…" value={filters.query} onChange={(event) => changeFilter('query', event.target.value)} /></label>
        <select className="field" aria-label="Akış ortamı" value={filters.environment} onChange={(event) => changeFilter('environment', event.target.value)}><option value="">Tüm ortamlar</option>{['DEV', 'TEST', 'PROD'].map((environment) => <option key={environment}>{environment}</option>)}</select>
        <select className="field" aria-label="Akış türü" value={filters.sync} onChange={(event) => changeFilter('sync', event.target.value)}><option value="">Senkron ve asenkron</option><option value="sync">Senkron</option><option value="async">Asenkron</option></select>
        <select className="field" aria-label="Akış kayıt durumu" value={filters.status} onChange={(event) => changeFilter('status', event.target.value)}><option value="">Tüm durumlar</option><option value="DRAFT">Taslak</option><option value="COMPLETED">Tamamlandı</option></select>
      </div>
    </section>

    <TaskFeedback task={exportTask} />
    {error && <ErrorPanel error={error} />}
    {loading && <Loading />}
    {!unavailable && <>
      {!filtered.length ? <EmptyState icon="flow" title={records.length ? 'Bu filtrelerle eşleşen akış bulunamadı' : 'Henüz gösterilecek bir akış yok'} description={records.length ? 'Kaynak, hedef veya ara katman seçimini değiştirerek yeniden deneyin.' : 'Kataloğa eklenen entegrasyonlar burada otomatik olarak akış çizimine dönüşür.'}>{hasFilters && <button type="button" className="btn" onClick={clearFilters}>Filtreleri temizle</button>}</EmptyState> : <div className="flow-workspace">
        <section className="flow-map-surface" aria-label="Akış çizimi">
          <div className="flow-map-heading"><div><h2>Bağlantı görünümü</h2><p>Ortak sistemler tek kutuda. Her renkli yol ayrı bir entegrasyon.</p></div><span className="flow-count" role="status">{filtered.length} akış</span></div>
          <div className="flow-map-tools">
            <div className="flow-legend"><span><i className="is-source" />Kaynak</span><span><i className="is-middleware" />Ara katman</span><span><i className="is-target" />Hedef</span></div>
            <div className="flow-zoom"><button type="button" className="btn" aria-label="Uzaklaştır" disabled={scale <= 0.5} onClick={() => setZoom(Math.max(0.5, scale - 0.1))}>−</button><output aria-label="Yakınlaştırma oranı">%{Math.round(scale * 100)}</output><button type="button" className="btn" aria-label="Yakınlaştır" disabled={scale >= 1.5} onClick={() => setZoom(Math.min(1.5, scale + 0.1))}>+</button><button type="button" className="btn" onClick={() => setZoom(Math.max(0.2, Math.min(1, (viewportWidth - 24) / FLOW_WIDTH)))}><AppIcon name="fit" />Sığdır</button></div>
          </div>
          <div className="flow-selection"><label className="label">Haritada akış seç<select className="field" aria-label="Haritada akış seç" value={selected?.id ?? ''} onChange={(event) => chooseFlow(event.target.value)}>{filtered.map((record) => <option value={record.id} key={record.id}>{record.serviceName} · #{record.id}</option>)}</select></label><span>Seçilen yol, ortak bağlantı noktaları boyunca vurgulanır.</span></div>
          <div className="flow-map-viewport" ref={viewportRef} tabIndex={0} role="region" aria-label="Kaydırılabilir akış haritası">
            <div className="flow-map-svg" style={{ width: FLOW_WIDTH * scale, height: diagramHeight * scale }} onClick={(event) => selectFlow(event.target)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('[data-flow-id]')) { event.preventDefault(); selectFlow(event.target, true) } }} dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <div className="flow-map-footer"><span>{filtered.length} akış · {flowSystemCount(filtered)} sistem</span><span>Tüm sonuçlar aynı haritada</span></div>
        </section>

        {selected && <aside className="flow-detail" aria-label="Seçili akış ayrıntıları">
          <div className="flow-detail-eyebrow"><span><AppIcon name="flow" />SEÇİLİ AKIŞ</span></div>
          <h2>{selected.serviceName}</h2>
          <div className="flow-detail-badges"><span className={selected.status === 'DRAFT' ? 'is-draft' : 'is-completed'}>{selected.status === 'DRAFT' ? 'Taslak' : 'Tamamlandı'}</span><span>{selected.syncType === 'sync' ? 'Senkron' : 'Asenkron'}</span>{selected.reviewRequired && <span className="is-draft">İnceleme gerekli</span>}</div>
          <p className="flow-detail-description">{selected.description || 'Bu entegrasyon için açıklama eklenmemiş.'}</p>
          <ol className="flow-detail-route">
            <li className="is-source"><small>Kaynak sistem</small><strong>{selected.sourceSystem}</strong></li>
            {selected.hasMiddleware && <li className="is-middleware"><small>Ara katman</small><strong>{selected.middleware || 'Ara katman'}</strong></li>}
            <li className="is-target"><small>Hedef sistem</small><strong>{selected.destinationSystem}</strong></li>
          </ol>
          <dl className="flow-detail-properties"><div><dt>Bağlantı</dt><dd>{selected.hasMiddleware ? 'Ara katman üzerinden' : 'Doğrudan'}</dd></div><div><dt>Kayıtlı ortamlar</dt><dd>{selected.environmentTypes.length ? selected.environmentTypes.join(' · ') : 'Henüz eklenmedi'}</dd></div><div><dt>Son güncelleme</dt><dd>{selected.lastUpdated}</dd></div></dl>
          <button type="button" className="btn-primary" onClick={() => onOpenIntegration(selected.id)}>Entegrasyonu aç<AppIcon name="arrow" /></button>
          <button type="button" className="btn" disabled={filters.integration === selected.id} onClick={() => changeFilter('integration', selected.id)}>Yalnızca bu akışı göster</button>
        </aside>}
      </div>}
      <p className="flow-map-note"><AppIcon name="info" /><span>Çizimler katalogda kayıtlı bağlantı yönlerini gösterir. Görsel ve PDF çıktıları filtreye uyan tüm akışları içerir.</span></p>
    </>}
  </div>
}

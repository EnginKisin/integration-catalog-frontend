import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { defaultExpanded, visibleStudioFields } from '../../../lib/mappingStudio'
import type { StudioField, StudioLink, StudioPairOption, StudioPaneData } from '../../../lib/mappingStudio'
import './mapping-studio.css'

const palette = ['#a78bfa', '#38bdf8', '#2dd4bf', '#fbbf24', '#f472b6', '#818cf8']
const rowHeight = 30
type IconName = 'arrow' | 'search' | 'chevron' | 'undo' | 'redo' | 'download' | 'expand' | 'collapse' | 'close' | 'link' | 'list'
const iconPaths: Record<IconName, string> = {
  arrow: 'M4 10h12m-5-5 5 5-5 5', search: 'm13.5 13.5 3.5 3.5M15 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  chevron: 'm7 4 6 6-6 6', undo: 'M7 4 3 8l4 4M3 8h8a5 5 0 0 1 0 10', redo: 'm13 4 4 4-4 4m4-4H9a5 5 0 0 0 0 10',
  download: 'M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4', expand: 'M4 3v5h5m7 9v-5h-5M4 8l5-5m7 9-5 5', collapse: 'M4 8h5V3m7 9h-5v5M9 8 4 3m7 9 5 5',
  close: 'm5 5 10 10M15 5 5 15', link: 'm8 12 4-4m-6 3-1 1a3 3 0 0 0 4 4l3-3m-4-6 3-3a3 3 0 0 1 4 4l-1 1',
  list: 'M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01',
}
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={`studio-icon ${className}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>
}
function OriginBadge({ origin }: { origin?: StudioLink['origin'] }) {
  if (origin !== 'AI_ACCEPTED' && origin !== 'AI_EDITED') return null
  return <span className="studio-origin-badge" title={origin === 'AI_ACCEPTED' ? 'AI önerisi kullanıcı onayıyla eklendi.' : 'AI önerisi kullanıcı tarafından düzenlenerek eklendi.'}>{origin === 'AI_ACCEPTED' ? 'AI onaylı' : 'AI düzenlendi'}</span>
}

interface Props {
  source: StudioPaneData
  target: StudioPaneData
  middlewareName: string
  pairs: StudioPairOption[]
  pairKey: string
  links: StudioLink[]
  supported: boolean
  busy: boolean
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  onPairChange: (key: string) => void
  onConnect: (source: string, target: string) => string | undefined
  onAdd: () => string | undefined
  onUpdate: (id: string, source: string, target: string, pairKey: string) => boolean
  onRemove: (id: string) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  children?: ReactNode
}
interface Point { x: number; y: number }
interface Geometry { width: number; height: number; source: Map<string, Point>; target: Map<string, Point> }

export function MappingStudio({ source: sourceData, target: targetData, middlewareName, pairs, pairKey, links, supported, busy, readOnly, canUndo, canRedo, onPairChange, onConnect, onAdd, onUpdate, onRemove, onUndo, onRedo, onClear, children }: Props) {
  const [selection, setSelection] = useState<{ pairKey: string; source?: string; linkId?: string }>(() => ({ pairKey, linkId: links.find((link) => link.pairKey === pairKey)?.id }))
  const selectedSource = selection.pairKey === pairKey ? selection.source : undefined
  const selectedLink = links.find((link) => link.id === selection.linkId && link.pairKey === selection.pairKey)
  const [focusConnections, setFocusConnections] = useState(false)
  const [showList, setShowList] = useState(true)
  const [message, setMessage] = useState(readOnly ? 'Kayıtlı bağlantıları inceleyebilirsiniz.' : 'Önce kaynak alanı, ardından hedef alanı seçerek bir bağlantı oluşturun.')
  const [linkQuery, setLinkQuery] = useState('')
  const [geometry, setGeometry] = useState<Geometry>({ width: 0, height: 0, source: new Map(), target: new Map() })
  const canvasRef = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const blocked = busy || readOnly
  const pairLinks = useMemo(() => links.filter((link) => link.pairKey === pairKey), [links, pairKey])
  const sourceByPath = useMemo(() => new Map(sourceData.fields.map((field) => [field.path, field])), [sourceData.fields])
  const targetByPath = useMemo(() => new Map(targetData.fields.map((field) => [field.path, field])), [targetData.fields])
  const linkedSources = useMemo(() => new Set(pairLinks.map((link) => link.source.trim()).filter((path) => sourceByPath.has(path))), [pairLinks, sourceByPath])
  const linkedTargets = useMemo(() => new Set(pairLinks.map((link) => link.target.trim()).filter((path) => targetByPath.has(path))), [pairLinks, targetByPath])
  const selectedField = selectedSource ? sourceByPath.get(selectedSource) : undefined
  const pair = pairs.find((item) => item.key === pairKey)

  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const root = canvasRef.current
      if (!root) return
      const bounds = root.getBoundingClientRect()
      const next: Geometry = { width: bounds.width, height: bounds.height, source: new Map(), target: new Map() }
      for (const side of ['source', 'target'] as const) {
        const viewport = root.querySelector<HTMLElement>(`[data-studio-viewport="${side}"]`)
        if (!viewport) continue
        const clip = viewport.getBoundingClientRect()
        viewport.querySelectorAll<HTMLElement>('[data-studio-port]').forEach((port) => {
          const rect = port.getBoundingClientRect()
          const y = rect.top + rect.height / 2
          if (y >= clip.top && y <= clip.bottom) next[side].set(port.dataset.studioPort!, { x: rect.left + rect.width / 2 - bounds.left, y: y - bounds.top })
        })
      }
      setGeometry(next)
    })
  }, [])
  useEffect(() => {
    const root = canvasRef.current
    if (!root) return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    root.addEventListener('scroll', measure, true)
    measure()
    return () => { observer.disconnect(); root.removeEventListener('scroll', measure, true); cancelAnimationFrame(frame.current) }
  }, [measure])

  const inspect = (id: string) => {
    const link = links.find((item) => item.id === id)
    if (!link) return
    if (pairs.some((item) => item.key === link.pairKey && !item.disabled)) onPairChange(link.pairKey)
    setSelection({ pairKey: link.pairKey, linkId: id })
  }
  const connect = (source: string, target: string) => {
    if (blocked || !supported) return
    const existing = pairLinks.find((link) => link.source.trim() === source && link.target.trim() === target)
    if (existing) { inspect(existing.id); setMessage('Bu iki alan arasında zaten bir bağlantı var.'); return }
    const id = onConnect(source, target)
    if (id) { setSelection({ pairKey, linkId: id }); setMessage(`${sourceByPath.get(source)?.name ?? source} → ${targetByPath.get(target)?.name ?? target} bağlantısı eklendi.`) }
  }
  const add = () => {
    if (blocked || !supported) return
    const id = onAdd()
    if (id) { setSelection({ pairKey, linkId: id }); setMessage('Kaynak ve hedef alan yollarını sağdaki panelden girin.') }
  }
  const remove = (id: string) => {
    if (blocked) return
    onRemove(id)
    if (id === selectedLink?.id) setSelection({ pairKey })
    setMessage('Bağlantı kaldırıldı. Değişiklik kaydettiğinizde uygulanır.')
  }
  const exportLinks = () => {
    const data = JSON.stringify(links.map(({ source, target, pairLabel }) => ({ flow: pairLabel, sourceFieldPath: source, targetFieldPath: target })), null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'alan-eslemeleri.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Eşlemeler JSON dosyası olarak indirildi.')
  }
  const visibleLinks = links.filter((link) => `${link.source} ${link.target} ${link.pairLabel}`.toLocaleLowerCase('tr-TR').includes(linkQuery.toLocaleLowerCase('tr-TR')))
  const lines = pairLinks.flatMap((link) => {
    const source = geometry.source.get(link.source.trim())
    const target = geometry.target.get(link.target.trim())
    if (!source || !target) return []
    if (focusConnections && (selectedSource ? link.source.trim() !== selectedSource : selectedLink ? link.id !== selectedLink.id : false)) return []
    return [{ link, source, target, color: palette[links.indexOf(link) % palette.length] }]
  })
  const samePair = selectedLink?.pairKey === pairKey

  return <div className="mapping-studio" onKeyDown={(event) => { if (event.key === 'Escape') { setSelection({ pairKey }); setMessage('Seçim kaldırıldı.') } }}>
    <div className="studio-heading">
      <div><div className="studio-eyebrow">{readOnly ? 'KAYITLI EŞLEMELER' : 'ENTEGRASYON TASARIMI'}</div><h2>{readOnly ? 'Alan eşlemeleri' : 'Alan eşleme'}</h2><p>{readOnly ? 'Kaydedilmiş bağlantıları, alan yapılarını ve örnek değerleri inceleyin.' : 'Alan eşlemesi isteğe bağlıdır. Alanları seçerek, sürükleyerek veya yollarını yazarak bağlayın.'}</p></div>
      {readOnly && <span className="studio-readonly-badge">Yalnızca görüntüleme</span>}
    </div>
    <div className="studio-flow-selector-row">
      <label className="studio-pair-select"><span>Akış</span><select aria-label="Görselde incelenecek şema çifti" disabled={busy} value={pairKey} onChange={(event) => { onPairChange(event.target.value); setSelection({ pairKey: event.target.value }) }}>{pairs.map((item) => <option key={item.key} value={item.key} disabled={item.disabled}>{item.label}</option>)}</select></label>
    </div>
    {children}
    <div className="studio-editor">
      <div className="studio-toolbar">
        <div className="studio-toolbar-group"><span className="studio-flow-pill"><span />{pair?.label.includes('(Yanıt)') ? 'Yanıt eşlemesi' : 'İstek eşlemesi'}</span><span className="studio-toolbar-divider" />{!readOnly && <><button type="button" className="studio-icon-button" aria-label="Geri al" title="Geri al" disabled={busy || !canUndo} onClick={() => { onUndo(); setSelection({ pairKey }); setMessage('Son değişiklik geri alındı.') }}><Icon name="undo" /></button><button type="button" className="studio-icon-button" aria-label="İleri al" title="İleri al" disabled={busy || !canRedo} onClick={() => { onRedo(); setSelection({ pairKey }); setMessage('Değişiklik yeniden uygulandı.') }}><Icon name="redo" /></button><span className="studio-toolbar-divider" /></>}<button type="button" className={`studio-button studio-button-quiet ${focusConnections ? 'is-active' : ''}`} aria-pressed={focusConnections} onClick={() => setFocusConnections((current) => !current)}><Icon name="link" />Bağlantıya odaklan</button></div>
        <div className="studio-toolbar-group"><span className="studio-link-count">{pairLinks.length} bağlantı</span><button type="button" className="studio-icon-button" aria-label="Eşlemeleri indir" title="Eşlemeleri indir" disabled={busy} onClick={exportLinks}><Icon name="download" /></button>{!readOnly && <button type="button" className="studio-button" disabled={busy || !supported} onClick={add}><span aria-hidden="true">+</span> Elle eşleme ekle</button>}</div>
      </div>
      <div className="studio-workspace-and-inspector">
        <div ref={canvasRef} className="studio-workspace">
          <FieldPane key={`source/${pairKey}/${sourceData.format}`} side="source" {...sourceData} linked={linkedSources} selectedPath={selectedSource ?? (samePair ? selectedLink?.source.trim() : undefined)} disabled={busy} readOnly={readOnly} onChoose={(path) => { setSelection({ pairKey, source: path }); setMessage(readOnly ? `${path} alanını inceliyorsunuz.` : `${path} seçildi. Şimdi hedef alanı seçin.`) }} onConnect={connect} onInspect={inspect} links={pairLinks} onLayoutChange={measure} />
          <div className="studio-wire-lane"><span className="studio-wire-caption">{middlewareName}</span><span className="studio-wire-subtitle">Alan dönüşümü</span><span className="studio-wire-direction" aria-hidden="true"><Icon name="arrow" /></span><span className="studio-wire-total">{lines.length}<span>görünür bağlantı</span></span></div>
          <FieldPane key={`target/${pairKey}/${targetData.format}`} side="target" {...targetData} linked={linkedTargets} selectedPath={samePair ? selectedLink?.target.trim() : undefined} pendingSource={!blocked ? selectedSource : undefined} disabled={busy} readOnly={readOnly} onChoose={(path) => { if (selectedSource && !blocked) connect(selectedSource, path); else { const link = pairLinks.find((item) => item.target.trim() === path); if (link) inspect(link.id); else setMessage(readOnly ? `${path} alanı eşlenmemiş.` : 'Bağlamak için önce soldaki kaynak alanını seçin.') } }} onConnect={connect} onInspect={inspect} links={pairLinks} onLayoutChange={measure} />
          <svg className="studio-wires" aria-label="Alan bağlantıları" viewBox={`0 0 ${geometry.width || 1} ${geometry.height || 1}`}>
            {lines.map(({ link, source, target, color }) => {
              const middle = (source.x + target.x) / 2
              const d = `M ${source.x} ${source.y} C ${middle} ${source.y}, ${middle} ${target.y}, ${target.x} ${target.y}`
              const active = selectedLink?.id === link.id || selectedSource === link.source.trim()
              return <g key={link.id} className={`studio-wire ${active ? 'is-active' : ''}`} style={{ '--wire-color': color } as CSSProperties} role="button" tabIndex={0} aria-label={`${link.source} → ${link.target} bağlantısını incele`} onClick={() => inspect(link.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(link.id) } }}><path className="studio-wire-hit" d={d} /><path className="studio-wire-stroke" d={d} /><circle cx={source.x} cy={source.y} r={active ? 4 : 3} /><circle cx={target.x} cy={target.y} r={active ? 4 : 3} /></g>
            })}
          </svg>
        </div>
        <aside className="studio-inspector" aria-label="Eşleme ayrıntıları">
          <div className="studio-inspector-title"><span>ÖZELLİKLER</span><Icon name="list" /></div>
          {selectedLink ? <LinkInspector key={selectedLink.id} link={selectedLink} source={samePair ? sourceByPath.get(selectedLink.source.trim()) : undefined} target={samePair ? targetByPath.get(selectedLink.target.trim()) : undefined} sourceFields={samePair ? sourceData.fields : []} targetFields={samePair ? targetData.fields : []} pairs={pairs} disabled={blocked} readOnly={readOnly} onChange={(source, target, nextPair) => { const changed = onUpdate(selectedLink.id, source, target, nextPair); if (changed) { if (pairs.some((item) => item.key === nextPair)) onPairChange(nextPair); setSelection({ pairKey: nextPair, linkId: selectedLink.id }); setMessage('Bağlantı güncellendi. Değişiklik kaydettiğinizde uygulanır.') } return changed }} onRemove={() => remove(selectedLink.id)} /> : selectedField ? <div className="studio-inspector-content"><span className="studio-inspector-kicker">SEÇİLİ KAYNAK</span><h3>{selectedField.name}</h3><code className="studio-path">{selectedField.path}</code><div className="studio-value-box"><span>Örnek değer</span><code>{selectedField.value ?? 'Örnek değer bulunmuyor.'}</code></div><p className="studio-inspector-help">{readOnly ? 'Kayıtlı bir bağlantıyı incelemek için çizgiye veya listedeki satıra tıklayın.' : 'Sağdaki ağaçtan bir hedef alan seçin. Alanı hedefe sürükleyerek de bağlayabilirsiniz.'}</p><button type="button" className="studio-button" onClick={() => setSelection({ pairKey })}>Seçimi kaldır</button></div> : <div className="studio-inspector-empty"><span><Icon name="link" /></span><h3>Bir bağlantıyı keşfedin</h3><p>Çizgiye veya eşleme listesindeki bir satıra tıklayarak alanları ve örnek değerleri inceleyin.</p></div>}
          <div className="studio-inspector-note"><span className="studio-note-icon">i</span><p>{readOnly ? 'Örnek değerler referans içindir. Kayıtlı eşleme bilgilerini görüntülüyorsunuz.' : 'Örnek değerler referans içindir. Eşlemeler kaydedildiğinde katalog tanımı güncellenir.'}</p></div>
        </aside>
      </div>
      <section className={`studio-mapping-list ${showList ? '' : 'is-collapsed'}`} aria-label="Eşleme listesi">
        <div className="studio-list-toolbar"><button type="button" className="studio-list-toggle" aria-expanded={showList} onClick={() => setShowList((current) => !current)}><Icon name="chevron" className={showList ? 'is-expanded' : ''} />Tüm bağlantılar <span>{links.length}</span></button><div className="studio-toolbar-group">{!readOnly && <button type="button" className="studio-button studio-button-quiet" disabled={busy || !links.length} onClick={onClear}>Tüm eşlemeleri kaldır</button>}{showList && <label className="studio-link-search"><Icon name="search" /><input aria-label="Bağlantılarda ara" placeholder="Bağlantılarda ara…" value={linkQuery} onChange={(event) => setLinkQuery(event.target.value)} /></label>}</div></div>
        {showList && <div className="studio-table-scroll"><table><thead><tr><th scope="col">NO</th><th scope="col">KAYNAK ALAN</th><th scope="col" aria-label="Yön" /><th scope="col">HEDEF ALAN</th><th scope="col">AKIŞ / DURUM</th><th scope="col"><span className="sr-only">İşlemler</span></th></tr></thead><tbody>{visibleLinks.map((link) => {
          const index = links.indexOf(link)
          return <tr key={link.id} className={selectedLink?.id === link.id ? 'is-selected' : ''}><td><span className="studio-link-number" style={{ color: palette[index % palette.length] }}>{String(index + 1).padStart(2, '0')}</span></td><td><button type="button" className="studio-table-path" title={link.source || 'Kaynak alan yolu eksik'} onClick={() => inspect(link.id)}>{link.source || 'Kaynak alan seçin'}</button></td><td><Icon name="arrow" /></td><td><button type="button" className="studio-table-path" title={link.target || 'Hedef alan yolu eksik'} onClick={() => inspect(link.id)}>{link.target || 'Hedef alan seçin'}</button></td><td><span title={link.notes.join(' ') || link.pairLabel} className={link.notes.length ? 'studio-needs-review' : 'studio-valid'}>{link.notes.length ? '◐ Kontrol gerekli' : link.pairLabel.includes('(Yanıt)') ? '● Yanıt' : '● İstek'}</span><OriginBadge origin={link.origin} /></td><td>{!readOnly && <button type="button" className="studio-icon-button studio-remove-button" disabled={busy} aria-label={`${link.source || 'Boş eşleme'} bağlantısını kaldır`} onClick={() => remove(link.id)}><Icon name="close" /></button>}</td></tr>
        })}</tbody></table>{!visibleLinks.length && <p className="studio-list-empty">{links.length ? 'Aramanızla eşleşen bağlantı yok.' : 'Henüz alan eşlemesi yok. Eşleme eklemeden devam edebilirsiniz.'}</p>}</div>}
      </section>
      <footer className="studio-statusbar"><p role="status"><span className="studio-status-dot" />{message}</p><span className="studio-status-meta">{linkedTargets.size}/{targetData.fields.length} hedef eşlendi <span>·</span> {sourceData.fields.length + targetData.fields.length} alan</span></footer>
    </div>
    <div className="studio-bottom-note"><span>{readOnly ? 'Kayıtlı istek ve yanıt bağlantıları birlikte gösteriliyor.' : 'Kaydetme tüm istek ve yanıt bağlantılarını birlikte korur.'}</span><span><kbd>↑</kbd><kbd>↓</kbd> gezin <kbd>Enter</kbd> seç <kbd>Esc</kbd> bırak</span></div>
  </div>
}

interface FieldPaneProps {
  side: 'source' | 'target'
  disabled: boolean
  readOnly: boolean
  name: string
  caption: string
  fileName: string
  format: string
  fields: StudioField[]
  linked: Set<string>
  selectedPath?: string | null
  pendingSource?: string | null
  onChoose: (path: string) => void
  onConnect: (source: string, target: string) => void
  onInspect: (id: string) => void
  links: StudioLink[]
  onLayoutChange: () => void
}
function FieldPane({ disabled, readOnly, side, name, caption, fileName, format, fields, linked, selectedPath, pendingSource, onChoose, onConnect, onInspect, links, onLayoutChange }: FieldPaneProps) {
  const [expanded, setExpanded] = useState(() => defaultExpanded(fields))
  const [query, setQuery] = useState('')
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  const [activePath, setActivePath] = useState<string>()
  const viewportRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const treeId = useId()
  const filtered = useMemo(() => visibleStudioFields(fields, expanded, query, linked, onlyUnmapped), [fields, expanded, query, linked, onlyUnmapped])
  const groupCount = fields.filter((field) => !field.children.length).length
  const filteredLeaves = filtered.filter((field) => !field.children.length).length
  const activeIndex = Math.max(0, filtered.findIndex((field) => field.path === activePath))
  const first = Math.max(0, Math.min(Math.floor(scrollTop / rowHeight) - 6, filtered.length - 1))
  const end = Math.min(filtered.length, first + Math.ceil(viewportHeight / rowHeight) + 12)
  const rendered = filtered.slice(first, end)
  const filtering = Boolean(query.trim() || onlyUnmapped)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => { setViewportHeight(viewport.clientHeight); onLayoutChange() })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [onLayoutChange])
  useEffect(() => { onLayoutChange() }, [filtered, first, end, onLayoutChange])
  const resetScroll = () => { if (viewportRef.current) viewportRef.current.scrollTop = 0; setScrollTop(0) }
  const toggle = (path: string) => setExpanded((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const activate = (index: number) => {
    const row = filtered[Math.max(0, Math.min(index, filtered.length - 1))]
    if (!row || !viewportRef.current) return
    const actualIndex = filtered.indexOf(row)
    setActivePath(row.path)
    const top = actualIndex * rowHeight
    if (top < viewportRef.current.scrollTop) viewportRef.current.scrollTop = top
    else if (top + rowHeight > viewportRef.current.scrollTop + viewportHeight) viewportRef.current.scrollTop = top + rowHeight - viewportHeight
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = filtered[activeIndex]
    if (!row || disabled) return
    if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault()
    if (event.key === 'ArrowDown') activate(activeIndex + 1)
    if (event.key === 'ArrowUp') activate(activeIndex - 1)
    if (event.key === 'Home') activate(0)
    if (event.key === 'End') activate(filtered.length - 1)
    if (event.key === 'ArrowRight' && row.children.length) { if (!expanded.has(row.path)) toggle(row.path); else activate(activeIndex + 1) }
    if (event.key === 'ArrowLeft') { if (row.children.length && expanded.has(row.path)) toggle(row.path); else if (row.parent) activate(filtered.findIndex((field) => field.path === row.parent)) }
    if (event.key === 'Enter') onChoose(row.path)
    if (event.key === ' ') { if (row.children.length) toggle(row.path); else onChoose(row.path) }
  }

  return <section className={`studio-field-pane studio-${side}`} aria-label={`${side === 'source' ? 'Kaynak' : 'Hedef'} alanları`} onKeyDown={(event) => { if (event.key === '/' && event.target instanceof Element && !['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); searchRef.current?.focus() } }}>
    <header className="studio-pane-heading"><div className="studio-system-icon">{side === 'source' ? '↗' : '↙'}</div><div className="studio-pane-heading-text"><span>{caption}</span><h2>{name}</h2></div><span className="studio-format-tag">{format}</span></header>
    <div className="studio-file-tab"><span className="studio-file-icon">{format === 'JSON' ? '{ }' : '< >'}</span><span>{fileName}</span><span className="studio-file-dot" /></div>
    <div className="studio-field-tools"><label className="studio-field-search"><Icon name="search" /><input ref={searchRef} type="search" aria-label={`${side === 'source' ? 'Kaynak' : 'Hedef'} alanlarda ara`} placeholder="Alan veya değer ara…" value={query} onChange={(event) => { setQuery(event.target.value); resetScroll() }} /><kbd>/</kbd></label><div className="studio-tree-actions"><label><input type="checkbox" checked={onlyUnmapped} onChange={(event) => { setOnlyUnmapped(event.target.checked); resetScroll() }} />Eşlenmemiş</label><span>{filteredLeaves}/{groupCount}</span><button type="button" className="studio-icon-button" aria-label={`${side === 'source' ? 'Kaynak' : 'Hedef'} ağacını genişlet`} title="Tümünü genişlet" onClick={() => { setExpanded(new Set(fields.filter((field) => field.children.length).map((field) => field.path))); resetScroll() }}><Icon name="expand" /></button><button type="button" className="studio-icon-button" aria-label={`${side === 'source' ? 'Kaynak' : 'Hedef'} ağacını daralt`} title="Tümünü daralt" onClick={() => { setExpanded(new Set()); resetScroll() }}><Icon name="collapse" /></button></div></div>
    <div className="studio-tree-columns" aria-hidden="true"><span>ALAN</span><span>ÖRNEK DEĞER</span></div>
    <div ref={viewportRef} className="studio-tree-viewport" data-studio-viewport={side} role="tree" aria-label={`${side === 'source' ? 'Kaynak' : 'Hedef'} alan listesi`} tabIndex={0} aria-activedescendant={activeIndex >= first && activeIndex < end && filtered.length ? `${treeId}-${activeIndex}` : undefined} onKeyDown={onKeyDown} onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); onLayoutChange() }}>
      <div className="studio-tree-spacer" role="presentation" style={{ height: filtered.length * rowHeight }}>
        {rendered.map((field, offset) => {
          const index = first + offset
          const group = field.children.length > 0
          const open = filtering || expanded.has(field.path)
          const selected = selectedPath === field.path
          const connected = linked.has(field.path)
          return <div id={`${treeId}-${index}`} role="treeitem" key={field.path} data-active={index === activeIndex} aria-label={`${field.path}, ${field.type}${connected ? ', eşlenmiş' : ''}`} aria-level={field.depth + 1} aria-expanded={group ? open : undefined} aria-selected={selected} className={`studio-tree-row ${group ? 'is-group' : ''} ${selected ? 'is-selected' : ''} ${connected ? 'is-linked' : ''} ${side === 'target' && pendingSource && !group ? 'is-connectable' : ''}`} style={{ top: index * rowHeight, '--field-depth': Math.min(field.depth, 12) } as CSSProperties} title={`${field.path}${field.value ? `\n${field.value}` : ''}`} draggable={!disabled && !readOnly && side === 'source'} onDragStart={(event) => { event.dataTransfer.setData('text/x-mapping-field', field.path); event.dataTransfer.effectAllowed = 'link' }} onDragOver={(event) => { if (!disabled && !readOnly && side === 'target' && event.dataTransfer.types.includes('text/x-mapping-field')) { event.preventDefault(); event.dataTransfer.dropEffect = 'link' } }} onDrop={(event) => { const from = event.dataTransfer.getData('text/x-mapping-field'); if (!disabled && !readOnly && side === 'target' && from) { event.preventDefault(); onConnect(from, field.path) } }} onClick={() => { setActivePath(field.path); viewportRef.current?.focus({ preventScroll: true }); if (group) toggle(field.path); else if (!disabled) onChoose(field.path) }}>
            <span className="studio-line-number" aria-hidden="true">{index + 1}</span>
            <span className="studio-field-name"><span className="studio-tree-chevron">{group && <Icon name="chevron" className={open ? 'is-expanded' : ''} />}</span><span className={`studio-type-icon studio-type-${field.type.split(' | ')[0]}`} aria-hidden="true">{field.type.includes('object') ? '{}' : field.type.includes('array') ? '[]' : field.type === 'string' ? 'S' : field.type === 'number' ? '#' : 'B'}</span><span className="studio-field-label">{field.name}</span>{group && <span className="studio-child-count">{field.children.length}</span>}</span>
            <span className="studio-field-value">{field.value !== undefined ? field.type === 'string' ? `"${field.value}"` : field.value : ''}</span>
            <span className={`studio-port ${connected ? 'is-connected' : ''}`} data-studio-port={field.path} onClick={(event) => { event.stopPropagation(); if (!disabled) onChoose(field.path) }} onDoubleClick={(event) => { event.stopPropagation(); const link = links.find((item) => (side === 'source' ? item.source : item.target) === field.path); if (link) onInspect(link.id) }} />
          </div>
        })}
      </div>
      {!filtered.length && <div className="studio-tree-empty"><Icon name="search" /><p>Alan bulunamadı.</p><button type="button" className="studio-button" onClick={() => { setQuery(''); setOnlyUnmapped(false); resetScroll() }}>Filtreleri temizle</button></div>}
    </div>
    <footer className="studio-pane-footer"><span>{linked.size} alan eşlendi</span><span>{side === 'target' && pendingSource ? 'Hedef seçin →' : '↑ ↓ gezin · Enter seç'}</span></footer>
  </section>
}

function LinkInspector({ link, source, target, sourceFields, targetFields, pairs, disabled, readOnly, onChange, onRemove }: {
  link: StudioLink; source?: StudioField; target?: StudioField; sourceFields: StudioField[]; targetFields: StudioField[]
  pairs: StudioPairOption[]; disabled: boolean; readOnly: boolean
  onChange: (source: string, target: string, pairKey: string) => boolean; onRemove: () => void
}) {
  const listId = useId()
  const knownPair = pairs.some((pair) => pair.key === link.pairKey)
  const suggestions = (fields: StudioField[], value: string) => fields.filter((field) => field.path.toLocaleLowerCase('tr-TR').includes(value.trim().toLocaleLowerCase('tr-TR'))).slice(0, 50)
  return <div className="studio-inspector-content">
    <span className="studio-inspector-kicker">ALAN BAĞLANTISI</span><OriginBadge origin={link.origin} /><h3>{source?.name ?? (link.source || 'Kaynak alan seçin')} <span aria-hidden="true">→</span> {target?.name ?? (link.target || 'Hedef alan seçin')}</h3>
    {readOnly ? <dl className="studio-readonly-fields">
      <div><dt>Akış</dt><dd>{link.pairLabel}</dd></div>
      <div><dt>Kaynak alan</dt><dd><code className="studio-readonly-path">{link.source || 'Kaynak alan yolu eksik'}</code></dd></div>
      <div><dt>Hedef alan</dt><dd><code className="studio-readonly-path">{link.target || 'Hedef alan yolu eksik'}</code></dd></div>
    </dl> : <fieldset disabled={disabled} className="studio-inspector-form">
      <label>Şema çifti<select aria-label="Şema çifti" value={link.pairKey} onChange={(event) => onChange(link.source, link.target, event.target.value)}>{!knownPair && <option value={link.pairKey} disabled>Uyumsuz veya eksik şema çifti</option>}{pairs.map((pair) => <option key={pair.key} value={pair.key} disabled={pair.disabled}>{pair.label}</option>)}</select></label>
      <label>Kaynak alan yolu<input aria-label="Kaynak alan yolu" maxLength={500} list={`${listId}-source`} value={link.source} onChange={(event) => onChange(event.target.value, link.target, link.pairKey)} placeholder="Örn. order.id" spellCheck={false} /></label>
      <span className="studio-inspector-arrow" aria-hidden="true">↓</span>
      <label>Hedef alan yolu<input aria-label="Hedef alan yolu" maxLength={500} list={`${listId}-target`} value={link.target} onChange={(event) => onChange(link.source, event.target.value, link.pairKey)} placeholder="Örn. externalOrderId" spellCheck={false} /></label>
      <datalist id={`${listId}-source`}>{suggestions(sourceFields, link.source).map((field) => <option key={field.path} value={field.path} />)}</datalist>
      <datalist id={`${listId}-target`}>{suggestions(targetFields, link.target).map((field) => <option key={field.path} value={field.path} />)}</datalist>
    </fieldset>}
    {link.notes.length ? <div className="studio-link-notes">{link.notes.map((note) => <p key={note} className="studio-inline-warning">{note}</p>)}</div> : <div className="studio-compatibility"><span>✓</span><div><strong>Alan bağlantısı</strong><p>{source?.type ?? 'Bilinmeyen tip'} <span aria-hidden="true">→</span> {target?.type ?? 'Bilinmeyen tip'}</p></div></div>}
    <div className="studio-example-comparison"><span>ÖRNEK DEĞERLER</span><div className="studio-value-box"><span>Kaynak</span><code>{source?.value ?? 'Örnek değer bulunmuyor.'}</code></div><div className="studio-value-box"><span>Hedef</span><code>{target?.value ?? 'Örnek değer bulunmuyor.'}</code></div><p>{readOnly ? 'Kayıtlı eşlemeyi görüntülüyorsunuz.' : 'Düzenlemeler taslağa eklenir; Kaydet dediğinizde uygulanır.'}</p></div>
    {!readOnly && <button type="button" className="studio-button studio-button-danger" disabled={disabled} onClick={onRemove}><Icon name="close" />Eşlemeyi kaldır</button>}
  </div>
}


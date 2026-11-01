import { useEffect, useMemo, useRef, useState } from 'react'
import type { SchemaField } from '../../lib/mapping'
import type { ManualMapping } from '../../types/integration'

interface Props {
  sourceFields: SchemaField[]
  destinationFields: SchemaField[]
  mappings: ManualMapping[]
  disabled?: boolean
  readOnly?: boolean
  onConnect: (source: string, target: string) => void
}
interface Point { x: number; y: number }
interface Geometry { width: number; height: number; source: Record<string, Point>; target: Record<string, Point> }
const colors = ['#60a5fa', '#c084fc', '#f472b6', '#34d399', '#fbbf24', '#818cf8']

export default function MappingCanvas({ sourceFields, destinationFields, mappings, disabled = false, readOnly = false, onConnect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [sourceQuery, setSourceQuery] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [geometry, setGeometry] = useState<Geometry>({ width: 0, height: 0, source: {}, target: {} })
  const rootRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLUListElement>(null)
  const targetRef = useRef<HTMLUListElement>(null)
  const filteredSource = useMemo(() => sourceFields.filter((field) => field.path.toLowerCase().includes(sourceQuery.toLowerCase())), [sourceFields, sourceQuery])
  const filteredTarget = useMemo(() => destinationFields.filter((field) => field.path.toLowerCase().includes(targetQuery.toLowerCase())), [destinationFields, targetQuery])
  useEffect(() => {
    const root = rootRef.current
    const sourceList = sourceRef.current
    const targetList = targetRef.current
    if (!root || !sourceList || !targetList) return
    let frame = 0
    const measure = () => {
      const rect = root.getBoundingClientRect()
      const points = (list: HTMLUListElement, source: boolean) => {
        const bounds = list.getBoundingClientRect()
        const result: Record<string, Point> = Object.create(null)
        list.querySelectorAll<HTMLButtonElement>('button[data-field]').forEach((button) => {
          const box = button.getBoundingClientRect()
          const y = box.top + box.height / 2
          if (y < bounds.top || y > bounds.bottom) return
          result[button.dataset.field!] = { x: (source ? box.right : box.left) - rect.left, y: y - rect.top }
        })
        return result
      }
      setGeometry({ width: rect.width, height: rect.height, source: points(sourceList, true), target: points(targetList, false) })
    }
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(measure) }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    observer?.observe(root); observer?.observe(sourceList); observer?.observe(targetList)
    sourceList.querySelectorAll('button[data-field]').forEach((button) => observer?.observe(button))
    targetList.querySelectorAll('button[data-field]').forEach((button) => observer?.observe(button))
    root.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
    return () => { observer?.disconnect(); window.cancelAnimationFrame(frame); root.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule) }
  }, [filteredSource, filteredTarget])
  const chosen = selected && sourceFields.some((field) => field.path === selected) ? selected : null
  const blocked = disabled || readOnly
  return <section className="space-y-3" aria-label="Görsel alan eşleme">
    <p role="status" className="hint">{readOnly ? 'Kayıtlı bağlantıları inceleyebilirsiniz.' : chosen ? `Seçili kaynak: ${chosen}. Bağlamak için hedef alanı seçin.` : 'Önce kaynak alanı, ardından hedef alanı seçin. Klavyeyle Tab ve Enter kullanabilirsiniz.'}</p>
    {!readOnly && chosen && <button type="button" className="btn" disabled={disabled} onClick={() => setSelected(null)}>Kaynak seçimini kaldır</button>}
    <div ref={rootRef} className="relative grid gap-12 sm:grid-cols-2 sm:gap-20">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block" viewBox={`0 0 ${geometry.width || 1} ${geometry.height || 1}`} preserveAspectRatio="none">
        {mappings.map((mapping, index) => {
          const source = Object.hasOwn(geometry.source, mapping.sourceField) ? geometry.source[mapping.sourceField] : undefined
          const target = Object.hasOwn(geometry.target, mapping.destinationField) ? geometry.target[mapping.destinationField] : undefined
          if (!source || !target) return null
          const middle = (source.x + target.x) / 2
          return <path key={mapping.id} d={`M ${source.x} ${source.y} C ${middle} ${source.y}, ${middle} ${target.y}, ${target.x} ${target.y}`} stroke={colors[index % colors.length]} strokeWidth={2.5} opacity={0.8} fill="none" />
        })}
      </svg>
      {([{ side: 'source', title: 'Kaynak alanlar', fields: filteredSource, query: sourceQuery, setQuery: setSourceQuery, ref: sourceRef }, { side: 'target', title: 'Hedef alanlar', fields: filteredTarget, query: targetQuery, setQuery: setTargetQuery, ref: targetRef }] as const).map((column) => <div key={column.side} className="relative min-w-0 space-y-3">
        <label className="label">{column.title}<input className="field" placeholder="Alan yolu ara" value={column.query} onChange={(event) => column.setQuery(event.target.value)} /></label>
        <ul ref={column.ref} className="max-h-[28rem] min-h-32 space-y-2 overflow-auto rounded-xl border border-white/10 bg-slate-950/70 p-2">
          {column.fields.length === 0 && <li className="p-3 text-sm text-slate-400">Alan bulunamadı. Eşleme listesinden alan yolunu elle girebilirsiniz.</li>}
          {column.fields.map((field) => {
            const connected = mappings.some((mapping) => column.side === 'source' ? mapping.sourceField === field.path : mapping.destinationField === field.path)
            const duplicate = chosen != null && mappings.some((mapping) => mapping.sourceField === chosen && mapping.destinationField === field.path)
            const isSelected = column.side === 'source' && chosen === field.path
            return <li key={field.path}><button type="button" data-field={field.path} className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default ${isSelected ? 'border-violet-300 bg-violet-500/30 text-white' : connected ? 'border-sky-400/40 bg-sky-500/10 text-slate-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`} style={{ paddingLeft: `${12 + Math.min(field.depth, 6) * 12}px` }} aria-pressed={column.side === 'source' ? isSelected : undefined} aria-label={`${column.title}: ${field.path}, ${field.type}${connected ? ', bağlantı var' : ''}`} disabled={blocked || (column.side === 'target' && (!chosen || duplicate))} onClick={() => {
              if (column.side === 'source') setSelected(field.path)
              else if (chosen) { onConnect(chosen, field.path); setSelected(null) }
            }}><span className="block break-all font-mono text-xs">{field.path}</span><span className="mt-1 block text-xs text-slate-400">{field.type}{field.repeated ? ' · Tekrarlanan' : ''}{field.kind === 'attribute' ? ' · Öznitelik' : ''}{connected ? ' · Bağlı' : ''}</span></button></li>
          })}
        </ul>
      </div>)}
    </div>
    <p className="hint">Çizgiler seçili şema çiftinin görünür alanları arasında gösterilir. Tüm bağlantılar aşağıdaki eşleme listesinde bulunur.</p>
  </section>
}

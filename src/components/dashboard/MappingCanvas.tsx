import { useState, useRef, useEffect } from 'react'
import type { ManualMapping } from '../../types/integration'

interface MappingCanvasProps {
  sourceFields: string[]
  destinationFields: string[]
  mappings: ManualMapping[]
  onConnect: (sourceField: string, destinationField: string) => void
}

interface FieldPosition {
  field: string
  top: number
  x: number
}

const colors = [
  'from-blue-500/30 to-blue-600/20',
  'from-purple-500/30 to-purple-600/20',
  'from-pink-500/30 to-pink-600/20',
  'from-green-500/30 to-green-600/20',
  'from-yellow-500/30 to-yellow-600/20',
  'from-indigo-500/30 to-indigo-600/20',
  'from-cyan-500/30 to-cyan-600/20',
  'from-orange-500/30 to-orange-600/20',
]

export default function MappingCanvas({ sourceFields, destinationFields, mappings, onConnect }: MappingCanvasProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [sourcePositions, setSourcePositions] = useState<FieldPosition[]>([])
  const [destPositions, setDestPositions] = useState<FieldPosition[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const sourceListRef = useRef<HTMLUListElement>(null)
  const destListRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const calculatePositions = () => {
      if (sourceListRef.current && destListRef.current) {
        const sourceItems = sourceListRef.current.querySelectorAll('li')
        const destItems = destListRef.current.querySelectorAll('li')
        
        const sourcePosArray: FieldPosition[] = []
        const destPosArray: FieldPosition[] = []

        sourceItems.forEach((item, index) => {
          if (index < sourceFields.length) {
            const rect = item.getBoundingClientRect()
            const containerRect = containerRef.current?.getBoundingClientRect()
            if (containerRect) {
              sourcePosArray.push({
                field: sourceFields[index],
                top: rect.top - containerRect.top + rect.height / 2,
                x: rect.right - containerRect.left,
              })
            }
          }
        })

        destItems.forEach((item, index) => {
          if (index < destinationFields.length) {
            const rect = item.getBoundingClientRect()
            const containerRect = containerRef.current?.getBoundingClientRect()
            if (containerRect) {
              destPosArray.push({
                field: destinationFields[index],
                top: rect.top - containerRect.top + rect.height / 2,
                x: rect.left - containerRect.left,
              })
            }
          }
        })

        setSourcePositions(sourcePosArray)
        setDestPositions(destPosArray)
      }
    }

    const timer = setTimeout(calculatePositions, 100)
    calculatePositions()
    window.addEventListener('resize', calculatePositions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', calculatePositions)
    }
  }, [sourceFields, destinationFields, mappings])

  const getSourcePosition = (field: string) => sourcePositions.find((p) => p.field === field)?.top ?? 0
  const getDestPosition = (field: string) => destPositions.find((p) => p.field === field)?.top ?? 0
  const getSourceX = (field: string) => sourcePositions.find((p) => p.field === field)?.x ?? 0
  const getDestX = (field: string) => destPositions.find((p) => p.field === field)?.x ?? 0
  const getMappingColor = (index: number) => colors[index % colors.length]

  const containerHeight = Math.max(
    sourcePositions.length > 0 ? Math.max(...sourcePositions.map((p) => p.top)) : 0,
    destPositions.length > 0 ? Math.max(...destPositions.map((p) => p.top)) : 0,
  ) + 100

  return (
    <div ref={containerRef} className="relative" style={{ minHeight: `${containerHeight}px` }}>
      <svg
        className="pointer-events-none absolute inset-0 w-full"
        style={{
          height: '100%',
          minHeight: `${containerHeight}px`,
        }}
        preserveAspectRatio="none"
      >
        {mappings.map((mapping, idx) => {
          const y1 = getSourcePosition(mapping.sourceField)
          const y2 = getDestPosition(mapping.destinationField)
          const x1 = getSourceX(mapping.sourceField)
          const x2 = getDestX(mapping.destinationField)
          if (y1 === 0 || y2 === 0) return null

          const containerWidth = containerRef.current?.offsetWidth ?? 1000
          const midX = containerWidth / 2

          if (x1 === 0 || x2 === 0) return null

          const colorClass = getMappingColor(idx)
          const colorMap: Record<string, string> = {
            'from-blue-500/30 to-blue-600/20': '#3b82f6',
            'from-purple-500/30 to-purple-600/20': '#a855f7',
            'from-pink-500/30 to-pink-600/20': '#ec4899',
            'from-green-500/30 to-green-600/20': '#10b981',
            'from-yellow-500/30 to-yellow-600/20': '#eab308',
            'from-indigo-500/30 to-indigo-600/20': '#6366f1',
            'from-cyan-500/30 to-cyan-600/20': '#06b6d4',
            'from-orange-500/30 to-orange-600/20': '#f97316',
          }
          const strokeColor = colorMap[colorClass] || '#3b82f6'

          return (
            <g key={mapping.id}>
              <path
                d={`M ${x1} ${y1} Q ${midX} ${(y1 + y2) / 2} ${x2} ${y2}`}
                stroke={strokeColor}
                strokeWidth="3"
                fill="none"
                opacity="0.7"
                strokeLinecap="round"
              />
              <circle cx={x1} cy={y1} r="5" fill={strokeColor} opacity="0.7" />
              <circle cx={x2} cy={y2} r="5" fill={strokeColor} opacity="0.7" />
            </g>
          )
        })}
      </svg>

      <div className="relative grid gap-16 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Kaynak Alanlar</p>
          <div className="space-y-2 text-sm text-slate-300">
            {sourceFields.length ? (
              <ul ref={sourceListRef} className="space-y-1">
                {sourceFields.map((field) => {
                  const mappingIdx = mappings.findIndex((m) => m.sourceField === field)
                  const hasMapping = mappingIdx >= 0
                  const bgColor = hasMapping ? getMappingColor(mappingIdx) : ''
                  
                  return (
                    <li
                      key={field}
                      tabIndex={0}
                      onClick={() => setSelectedSource(field)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedSource(field) }}
                      className={`cursor-pointer rounded-2xl px-3 py-2 transition ${
                        selectedSource === field 
                          ? 'bg-accent text-slate-950 ring-2 ring-accent' 
                          : hasMapping
                          ? `bg-gradient-to-r ${bgColor} border border-white/20 text-slate-100`
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {field}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Kaynak örnek girilmedi veya parser desteklenmiyor.</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Hedef Alanlar</p>
          <div className="space-y-2 text-sm text-slate-300">
            {destinationFields.length ? (
              <ul ref={destListRef} className="space-y-1">
                {destinationFields.map((field) => {
                  const mappingIdx = mappings.findIndex((m) => m.destinationField === field)
                  const hasMapping = mappingIdx >= 0
                  const bgColor = hasMapping ? getMappingColor(mappingIdx) : ''
                  
                  return (
                    <li
                      key={field}
                      tabIndex={0}
                      onClick={() => {
                        if (selectedSource) {
                          onConnect(selectedSource, field)
                          setSelectedSource(null)
                        }
                      }}
                      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && selectedSource) { onConnect(selectedSource, field); setSelectedSource(null) } }}
                      className={`cursor-pointer rounded-2xl px-3 py-2 transition ${
                        hasMapping
                          ? `bg-gradient-to-r ${bgColor} border border-white/20 text-slate-100`
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{field}</span>
                        <span className="text-xs text-slate-500">{selectedSource ? 'Bağla' : ''}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Hedef örnek girilmedi veya parser desteklenmiyor.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

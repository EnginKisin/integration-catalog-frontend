import { useState } from 'react'
import type { IntegrationRecord } from '../../types/integration'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/PageLayout'

interface IntegrationTableProps {
  data: IntegrationRecord[]
  filtered?: boolean
  onClearFilters: () => void
  onSelect: (id: string) => void
}

export function IntegrationTable({ data, filtered, onClearFilters, onSelect }: IntegrationTableProps) {
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(25)
  const pageCount = Math.max(1, Math.ceil(data.length / size))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * size
  const rows = data.slice(start, start + size)

  if (data.length === 0) {
    return (
      <EmptyState title={filtered ? 'Aramanıza uygun entegrasyon bulunamadı' : 'Henüz entegrasyon yok'} description={filtered ? 'Farklı bir arama yapın veya filtreleri temizleyin.' : 'Yeni entegrasyon eklediğinizde kayıtlar burada listelenir.'}>
        {filtered && <button type="button" className="btn mt-3" onClick={onClearFilters}>Filtreleri temizle</button>}
      </EmptyState>
    )
  }

  return (
    <div className="data-table-shell overflow-hidden border">
      <div className="overflow-x-auto focus-visible:outline focus-visible:outline-violet-400" role="region" aria-label="Entegrasyon tablosu, tüm sütunlar için yatay kaydırabilirsiniz" tabIndex={0}>
        <table className="catalog-table w-full text-left text-xs text-slate-300">
          <caption className="sr-only">Entegrasyonlar. Servis adına tıklayarak ayrıntıları açabilirsiniz.</caption>
          <thead className="bg-white/[0.04] text-slate-400">
            <tr>
              {['NO', 'Servis', 'Kaynak', 'Ara katman', 'Hedef', 'Format', 'Akış', 'Durum', 'İnceleme', 'Son güncelleme'].map((label) => <th key={label} scope="col" className="whitespace-nowrap font-medium">{label}</th>)}
              <th scope="col"><span className="sr-only">Ayrıntı</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((integration, index) => (
              <tr key={integration.id} onClick={() => onSelect(integration.id)} className="group cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-violet-400/[0.07] focus-within:bg-violet-400/[0.07]">
                <td className="tabular-nums text-slate-500">{start + index + 1}</td>
                <td className="min-w-48 max-w-72">
                  <button type="button" className="max-w-full truncate rounded text-left text-[13px] font-medium text-white underline-offset-4 group-hover:text-violet-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400" onClick={(event) => { event.stopPropagation(); onSelect(integration.id) }}>
                    {integration.serviceName}<span className="sr-only"> ayrıntılarını aç</span>
                  </button>
                  <p className="truncate text-[11px] text-slate-500" title={integration.description}>{integration.description || 'Açıklama yok'}</p>
                </td>
                <td><span className="block max-w-36 truncate" title={integration.sourceSystem}>{integration.sourceSystem || '—'}</span></td>
                <td><span className="block max-w-32 truncate text-slate-400" title={integration.middleware}>{integration.middleware || '—'}</span></td>
                <td><span className="block max-w-36 truncate" title={integration.destinationSystem}>{integration.destinationSystem || '—'}</span></td>
                <td className="whitespace-nowrap font-mono text-[11px] text-slate-400">{integration.formatSource.toUpperCase()} <span aria-label="hedef format">→</span> {integration.formatDestination.toUpperCase()}</td>
                <td>{integration.syncType === 'sync' ? 'Senkron' : 'Asenkron'}</td>
                <td><Badge variant={integration.status === 'COMPLETED' ? 'success' : 'warning'}>{integration.status === 'COMPLETED' ? 'Tamamlandı' : 'Taslak'}</Badge></td>
                <td className="whitespace-nowrap">{integration.reviewRequired ? <span className="text-amber-300">Bekliyor</span> : <span className="text-slate-500">Gerekmiyor</span>}</td>
                <td className="whitespace-nowrap tabular-nums text-slate-400">{integration.lastUpdated}</td>
                <td aria-hidden="true" className="text-slate-500 group-hover:text-violet-300">↗</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-400">
        <p aria-live="polite">{start + 1}–{Math.min(start + size, data.length)} / {data.length} kayıt</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">Sayfa başına<select className="field w-auto" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(0) }}>{[25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Önceki sayfa">←</button>
          <span className="tabular-nums">{currentPage + 1} / {pageCount}</span>
          <button type="button" className="btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Sonraki sayfa">→</button>
        </div>
      </footer>
    </div>
  )
}

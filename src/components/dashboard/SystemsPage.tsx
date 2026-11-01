import { FormField } from '../ui/FormField'
import { useEffect, useId, useRef, useState } from 'react'
import { useSession } from '../../auth/session'
import { useResource, useTask } from '../../hooks/useRequest'
import { canEdit, isAdmin } from '../../services/auth'
import { createSystem, deleteSystem, listSystems, setSystemActive, updateSystem } from '../../services/systemsBackend'
import type { SystemInput, SystemDefinition } from '../../types/system'
import { Badge } from '../ui/badge'
import { ErrorPanel, Loading, TaskFeedback } from '../ui/feedback'
import { SystemActions } from './SystemActions'
import { AppIcon } from '../ui/AppIcon'
import { EmptyState, MetricCard, PageHeader, SectionHeader } from '../ui/PageLayout'

interface SystemsPageProps {
  onBack: () => void
  onChanged: () => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}

type EditorPanel = { kind: 'create' } | { kind: 'detail'; item: SystemDefinition }

export function SystemsPage({ onBack, onChanged, onDirtyChange, onBusyChange }: SystemsPageProps) {
  const [busy, setBusy] = useState(false)
  const updateBusy = (value: boolean) => { setBusy(value); onBusyChange(value) }
  return (
    <div className="app-page">
      <PageHeader eyebrow="SİSTEM KATALOĞU" title="Sistemler" description="Ortak sistem kataloğunu yönetin. Sistemlerinizi kaynak, hedef veya ara katman olarak entegrasyonlarınıza bağlayın." actions={<button type="button" className="btn" disabled={busy} onClick={onBack}><AppIcon name="back" />Entegrasyonlara dön</button>} />
      <SystemManager onChanged={onChanged} onDirtyChange={onDirtyChange} onBusyChange={updateBusy} />
    </div>
  )
}

function SystemManager({ onChanged, onDirtyChange, onBusyChange }: Pick<SystemsPageProps, 'onChanged' | 'onDirtyChange' | 'onBusyChange'>) {
  const { user } = useSession()
  const resource = useResource(listSystems)
  const task = useTask()
  const [panel, setPanel] = useState<EditorPanel | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(25)
  const editable = user != null && canEdit(user)
  const admin = user != null && isAdmin(user)
  const busy = task.busy || resource.loading
  const records = resource.data ?? []
  const needle = query.trim().toLocaleLowerCase('tr-TR')
  const hasFilters = Boolean(needle || filter !== 'all')
  const filtered = records.filter((item) =>
    (filter === 'all' || item.active === (filter === 'active')) &&
    `${item.name} ${item.description}`.toLocaleLowerCase('tr-TR').includes(needle),
  ).sort((a, b) => (sort === 'usage' ? b.usageCount - a.usageCount : 0) || a.name.localeCompare(b.name, 'tr') || a.id - b.id)
  const pageCount = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * size
  const rows = filtered.slice(start, start + size)
  const activeCount = records.filter((item) => item.active).length
  const clearFilters = () => { setQuery(''); setFilter('all'); setPage(0) }
  const closePanel = () => { setPanel(null); onDirtyChange(false) }

  const mutate = (action: () => Promise<unknown>, message: string) => task.run(async () => {
    onBusyChange(true)
    try {
      await action()
    } finally {
      resource.reload()
      onChanged()
      onBusyChange(false)
    }
  }, message)

  const save = async (input: SystemInput) => {
    if (!editable || busy || resource.error || !panel) return false
    const success = await mutate(
      () => panel.kind === 'detail' ? updateSystem(panel.item.id, input) : createSystem(input),
      panel.kind === 'detail' ? 'Sistem güncellendi. Bağlı entegrasyonların bağlantıları korundu.' : 'Sistem oluşturuldu.',
    )
    if (success) closePanel()
    return success
  }

  return (
    <div className="space-y-4">
      <section aria-label="Sistem özeti" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Toplam sistem" value={records.length} icon="server" detail="katalogda tanımlı" />
        <MetricCard label="Aktif" value={activeCount} icon="check" tone="green" detail="yeni bağlantılara açık" />
        <MetricCard label="Pasif" value={records.length - activeCount} icon="clock" tone="amber" detail="mevcut bağlantılar korunur" />
        <MetricCard label="Kullanılan sistem" value={records.filter((item) => item.usageCount > 0).length} icon="link" tone="blue" detail="entegrasyonlara bağlı" />
      </section>
      <SectionHeader icon="server" title="Sistem kataloğu" description="Sistem ayrıntılarını inceleyin, kullanım ve aktiflik durumlarını yönetin." actions={<>
          <button type="button" className="btn" disabled={busy} onClick={resource.reload}><AppIcon name="refresh" />Yenile</button>
          {editable && <button type="button" className="btn-primary" disabled={busy || !!resource.error || !resource.data} onClick={() => setPanel({ kind: 'create' })}><AppIcon name="plus" /> Yeni sistem</button>}
      </>} />
      <section aria-label="Sistem filtreleri" className="data-toolbar flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Sistem ara" className="field min-w-48 flex-1 sm:max-w-sm" placeholder="İsim veya açıklama ara…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
        <select aria-label="Duruma göre filtrele" className="field w-auto" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }}>
          <option value="all">Tüm durumlar</option><option value="active">Aktif</option><option value="inactive">Pasif</option>
        </select>
        {hasFilters && <button type="button" className="btn" onClick={clearFilters}>Temizle</button>}
        <select aria-label="Sistemları sırala" className="field ml-auto w-auto" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0) }}>
          <option value="name">İsim (A–Z)</option><option value="usage">En çok kullanılan</option>
        </select>
      </section>
      <TaskFeedback task={task} />
      <ErrorPanel error={resource.error} />
      {resource.loading && <Loading />}
      {!resource.loading && !resource.error && <section aria-label="Sistem listesi" className="min-w-0 space-y-2">
        <p role="status" className="text-xs text-slate-400">{hasFilters ? `${records.length} kayıttan ${filtered.length} sonuç` : `${records.length} kayıt`}</p>
        {!filtered.length ? <EmptyState icon="server" title={hasFilters ? 'Aramanıza uygun sistem bulunamadı' : 'Henüz sistem eklenmedi'} description={hasFilters ? 'Farklı bir arama yapın veya filtreleri temizleyin.' : 'Eklediğiniz sistemler burada listelenir.'}>
          {hasFilters && <button type="button" className="btn mt-3" onClick={clearFilters}>Filtreleri temizle</button>}
        </EmptyState> : <div className="data-table-shell overflow-hidden border">
          <div className="overflow-x-auto focus-visible:outline focus-visible:outline-violet-400" role="region" aria-label="Sistem tablosu" tabIndex={0}>
            <table className="catalog-table w-full text-left text-xs text-slate-300">
              <caption className="sr-only">Sistemler. İsme tıklayarak ayrıntıları açabilirsiniz.</caption>
              <thead className="bg-white/[0.04] text-slate-400"><tr>{['NO', 'İsim', 'Açıklama', 'Durum', 'Kullanım', ...(editable ? ['İşlemler'] : [])].map((label) => <th key={label} scope="col" className={`whitespace-nowrap font-medium ${label === 'İşlemler' ? 'w-20 text-right' : ''}`}>{label}</th>)}</tr></thead>
              <tbody>{rows.map((item, index) => <tr key={item.id} className="group cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-violet-400/[0.07] focus-within:bg-violet-400/[0.07]" onClick={() => { if (!busy) setPanel({ kind: 'detail', item }) }}>
                <td className="w-14 tabular-nums text-slate-500">{start + index + 1}</td>
                <td className="min-w-40 max-w-64"><button type="button" disabled={busy} className="max-w-full truncate rounded text-left text-[13px] font-medium text-white underline-offset-4 group-hover:text-violet-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40" onClick={(event) => { event.stopPropagation(); setPanel({ kind: 'detail', item }) }}>{item.name}<span className="sr-only"> ayrıntılarını aç</span></button></td>
                <td className="min-w-48 max-w-md"><p className="truncate text-slate-400" title={item.description}>{item.description || '—'}</p></td>
                <td><Badge variant={item.active ? 'success' : 'muted'}>{item.active ? 'Aktif' : 'Pasif'}</Badge></td>
                <td className="whitespace-nowrap tabular-nums"><span className={item.usageCount > 0 ? 'text-slate-200' : 'text-slate-500'}>{item.usageCount} entegrasyon</span></td>
                {editable && <td className="text-right" onClick={(event) => event.stopPropagation()}>
                  <SystemActions item={item} busy={busy} admin={admin} onEdit={() => setPanel({ kind: 'detail', item })} onToggleActive={() => void mutate(() => setSystemActive(item.id, !item.active), item.active ? 'Sistem pasifleştirildi. Mevcut entegrasyon bağlantıları korundu.' : 'Sistem aktifleştirildi.')} onDelete={() => {
                    if (window.confirm(`“${item.name}” kalıcı olarak silinsin mi?`)) void mutate(() => deleteSystem(item.id), 'Sistem silindi.')
                  }} />
                </td>}
              </tr>)}</tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-400">
            <p aria-live="polite">{start + 1}–{Math.min(start + size, filtered.length)} / {filtered.length} kayıt</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">Sayfa başına<select className="field w-auto" value={size} disabled={task.busy} onChange={(event) => { setSize(Number(event.target.value)); setPage(0) }}>{[25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <button type="button" className="btn" disabled={task.busy || currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Önceki sayfa">←</button>
              <span className="tabular-nums">{currentPage + 1} / {pageCount}</span>
              <button type="button" className="btn" disabled={task.busy || currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Sonraki sayfa">→</button>
            </div>
          </footer>
        </div>}
      </section>}
      {panel && <SystemDialog key={panel.kind === 'detail' ? panel.item.id : 'new'} item={panel.kind === 'detail' ? panel.item : undefined} title="Sistem" editable={editable} busy={busy} error={task.error} disabled={!!resource.error || !resource.data} onDirty={() => onDirtyChange(true)} onSave={save} onClose={closePanel} />}
    </div>
  )
}

function SystemDialog({ item, title, editable, busy, error, disabled, onDirty, onSave, onClose }: {
  item?: SystemDefinition; title: string; editable: boolean; busy: boolean; error?: Error; disabled: boolean
  onDirty: () => void; onSave: (input: SystemInput) => Promise<boolean>; onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [dirty, setDirty] = useState(false)
  const [attempted, setAttempted] = useState(false)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    nameRef.current?.focus()
    return () => { dialog?.close() }
  }, [])
  const close = () => {
    if (busy) return
    if (dirty && !window.confirm('Kaydedilmemiş sistem değişiklikleri bırakılacak. Devam edilsin mi?')) return
    onClose()
  }
  return <dialog ref={dialogRef} aria-labelledby={titleId} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-[#0c0f18] p-5 text-slate-100 shadow-2xl backdrop:bg-black/60" onCancel={(event) => { event.preventDefault(); close() }}>
    <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-base font-semibold">{title} {item ? (editable ? 'düzenle' : 'ayrıntısı') : 'ekle'}</h2>{item && <Badge variant={item.active ? 'success' : 'muted'}>{item.active ? 'Aktif' : 'Pasif'}</Badge>}</div>
    {item && <p className="hint mb-4">{item.usageCount} entegrasyonda kullanılıyor.{item.usageCount > 0 ? ' Pasifleştirme mevcut bağlantıları korur.' : ''}</p>}
    {attempted && <div className="mb-4"><ErrorPanel error={error} /></div>}
    {editable ? <form className="space-y-4" onChange={() => { setDirty(true); onDirty() }} onSubmit={(event) => {
      event.preventDefault()
      if (!name.trim() || busy || disabled) return
      setAttempted(true)
      void onSave({ name: name.trim(), description })
    }}>
      <fieldset disabled={busy || disabled} className="space-y-3">
        <FormField label="İsim" field="name" error={attempted ? error : undefined} className="label"><input ref={nameRef} className="field" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <label className="label">Açıklama <span className="font-normal text-slate-500">(isteğe bağlı)</span><textarea className="field" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-white/10 pt-3"><button type="button" className="btn" disabled={busy} onClick={close}>Vazgeç</button><button className="btn-primary" disabled={busy || disabled || !name.trim() || (Boolean(item) && !dirty)}>{busy ? 'Kaydediliyor…' : item ? 'Değişiklikleri kaydet' : 'Sistem ekle'}</button></div>
    </form> : <div className="space-y-4"><dl className="space-y-3 text-sm"><div><dt className="text-xs text-slate-500">İsim</dt><dd className="mt-1 break-words">{item?.name}</dd></div><div><dt className="text-xs text-slate-500">Açıklama</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-300">{item?.description || 'Açıklama yok.'}</dd></div></dl><div className="flex justify-end border-t border-white/10 pt-3"><button type="button" className="btn" onClick={close}>Kapat</button></div></div>}
  </dialog>
}

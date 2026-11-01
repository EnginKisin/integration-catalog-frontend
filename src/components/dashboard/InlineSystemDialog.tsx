import { FormField } from '../ui/FormField'
import { useEffect, useId, useRef, useState } from 'react'
import { useTask } from '../../hooks/useRequest'
import { ApiError } from '../../services/api'
import { createSystem } from '../../services/systemsBackend'
import type { SystemDefinition } from '../../types/system'
import { TaskFeedback } from '../ui/feedback'

export function InlineSystemDialog({ onCreated, onClose, onBusyChange }: {
  onCreated: (item: SystemDefinition) => void; onClose: () => void; onBusyChange: (busy: boolean) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const task = useTask()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    nameRef.current?.focus()
    return () => dialog?.close()
  }, [])
  const close = () => {
    if (task.busy) return
    if ((name || description) && !uncertain && !window.confirm('Sistem tanımı kaydedilmedi. Pencere kapatılsın mı?')) return
    onClose()
  }
  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close() }} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl border border-white/15 bg-[#0c0f18] p-5 text-slate-100 shadow-2xl backdrop:bg-black/60">
    <div><h2 id={titleId} className="font-semibold">Sistem ekle</h2><p className="hint mt-1">Eklediğiniz sistem ilgili alanda otomatik seçilir. Aynı sistem kaynak, hedef ve ara katman seçimlerinde kullanılabilir.</p></div>
    <TaskFeedback task={task} />
    {uncertain && <p className="error-panel">Sistem eklenmiş olabilir. Bu pencereyi kapatıp “Sistemleri yenile” ile listeyi kontrol edin.</p>}
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault()
      if (!name.trim() || task.busy || uncertain) return
      void task.run(async () => {
        onBusyChange(true)
        try {
          const item = await createSystem({ name, description })
          if (!Number.isSafeInteger(item?.id) || item.id <= 0 || !item.active) throw new ApiError('Sistem yanıtı doğrulanamadı. Listeyi yenileyip kontrol edin.')
          onCreated(item)
        } catch (error) {
          if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) setUncertain(true)
          throw error
        } finally { onBusyChange(false) }
      })
    }}>
      <fieldset disabled={task.busy || uncertain} className="space-y-3">
        <FormField label="Sistem adı" field="name" error={task.error} className="label"><input ref={nameRef} className="field" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <FormField label="Açıklama (isteğe bağlı)" field="description" error={task.error} className="label"><textarea className="field" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn" disabled={task.busy} onClick={close}>{uncertain ? 'Kapat ve listeyi kontrol et' : 'Vazgeç'}</button><button className="btn-primary" disabled={task.busy || uncertain || !name.trim()}>{task.busy ? 'Ekleniyor…' : 'Ekle ve seç'}</button></div>
    </form>
  </dialog>
}

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorPanel } from '../ui/feedback'

interface Props {
  name: string
  disabled: boolean
  busy: boolean
  error?: Error
  onDelete: () => Promise<boolean>
}

export function IntegrationActions({ name, disabled, busy, error, onDelete }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [attempted, setAttempted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return <>
    <div ref={menuRef} className="relative" onBlur={(event) => {
      // Safari may not focus a clicked button. A null relatedTarget must not
      // remove the action between pointerdown and click; outside clicks are
      // handled separately by the document listener.
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
    }}>
      <button ref={triggerRef} type="button" className="btn" disabled={busy} aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((open) => !open)}>
        İşlemler <span aria-hidden="true">⌄</span>
      </button>
      <div id={menuId} hidden={!menuOpen} className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-white/10 bg-[#0c0f18] p-1 shadow-xl shadow-black/30">
        <button type="button" className="btn w-full justify-start border-transparent bg-transparent text-rose-300 hover:bg-rose-500/10" disabled={disabled} onClick={() => {
          setMenuOpen(false)
          setAttempted(false)
          dialogRef.current?.showModal()
          cancelRef.current?.focus()
        }}>Entegrasyonu sil</button>
      </div>
    </div>
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} className="m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border border-white/15 bg-[#0c0f18] p-5 text-slate-100 shadow-2xl backdrop:bg-black/60" onCancel={(event) => { if (busy) event.preventDefault() }} onClose={() => triggerRef.current?.focus()}>
      <h2 id={titleId} className="text-base font-semibold">Entegrasyonu sil</h2>
      <div id={descriptionId} className="space-y-2 text-sm text-slate-300">
        <p className="break-words">“{name}” kalıcı olarak silinsin mi?</p>
        <p className="hint">Entegrasyon ve ilişkili ortam, şema ve eşleme kayıtları kaldırılır. Bu işlem geri alınamaz.</p>
      </div>
      {attempted && <ErrorPanel error={error} />}
      <div className="flex justify-end gap-2">
        <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={() => dialogRef.current?.close()}>Vazgeç</button>
        <button type="button" className="btn-danger" disabled={disabled} onClick={() => {
          setAttempted(true)
          void onDelete().then((success) => { if (success) dialogRef.current?.close() })
        }}>{busy ? 'Siliniyor…' : 'Entegrasyonu sil'}</button>
      </div>
    </dialog>
  </>
}

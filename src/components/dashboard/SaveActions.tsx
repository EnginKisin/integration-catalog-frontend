export function SaveActions({ busy, saving = busy, disabled, creating = false, onBack }: { busy: boolean; saving?: boolean; disabled?: boolean; creating?: boolean; onBack?: () => void }) {
  return <div className="save-actions flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
    {onBack && <button type="button" className="btn" disabled={busy} onClick={onBack}>← Önceki adım</button>}
    <button type="submit" name="intent" value="next" className="btn-primary sm:ml-auto" disabled={busy || disabled}>{saving ? 'Kaydediliyor…' : 'Kaydet ve devam et →'}</button>
    <button type="submit" name="intent" value="exit" className="btn" disabled={busy || disabled}>Kaydet ve çık</button>
    {creating && <p className="hint w-full">İlk kayıtta taslak oluşur. Diğer adımları daha sonra tamamlayabilirsiniz.</p>}
  </div>
}

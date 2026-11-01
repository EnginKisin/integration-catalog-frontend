import { useId, useState } from 'react'
import { credentialFields, credentialText, credentialValues } from '../../lib/credentials'
import type { AuthType } from '../../types/integration'

export function CredentialsEditor({ type, value, preserve, onChange }: {
  type: Exclude<AuthType, 'NONE'>; value: string; preserve: boolean; onChange: (value: string) => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const [error, setError] = useState('')
  const descriptionId = useId()
  const toggle = () => {
    if (advanced) {
      try { credentialValues(type, value) }
      catch (failure) { setError((failure as Error).message); return }
    }
    setError(''); setAdvanced(!advanced)
  }
  const values = advanced ? {} : credentialValues(type, value)
  const required = !preserve || Boolean(value.trim())
  return <div className="space-y-2 border-t border-white/10 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{preserve ? 'Erişim bilgilerini değiştir' : 'Erişim bilgileri'}</h3><button type="button" className="text-xs text-violet-300 underline-offset-4 hover:underline" aria-expanded={advanced} onClick={toggle}>{advanced ? 'Form alanlarına dön' : 'Gelişmiş: özel alanlar (JSON)'}</button></div>
    {preserve && <p className="hint">Kayıtlı bilgileri korumak için boş bırakın. Yeni bilgi girerseniz önceki bilgilerin tamamı değiştirilir.</p>}
    {error && <p role="alert" className="error-panel">{error}</p>}
    {advanced ? <><label className="label">Erişim bilgileri (JSON nesnesi)<textarea className="field font-mono" rows={4} spellCheck={false} autoComplete="off" aria-describedby={descriptionId} required={!preserve} value={value} onChange={(event) => onChange(event.target.value)} /></label><p id={descriptionId} className="hint">Bağlı sistemin beklediği özel alan adlarını kullanabilirsiniz. Bu bilgiler yalnızca katalogda saklanır.</p></> : <div className={`grid gap-3 ${credentialFields[type].length > 2 ? 'sm:grid-cols-2 lg:grid-cols-4' : credentialFields[type].length > 1 ? 'sm:grid-cols-2' : ''}`}>{credentialFields[type].map((field) => <label key={field.key} className="label">{field.label}{field.optional ? ' (isteğe bağlı)' : ''}<input className="field" type={field.secret ? 'password' : 'text'} autoComplete={field.secret ? 'new-password' : 'off'} spellCheck={false} required={required && !field.optional} placeholder={field.placeholder} value={values[field.key] ?? ''} onChange={(event) => onChange(credentialText({ ...values, [field.key]: event.target.value }))} /></label>)}</div>}
  </div>
}

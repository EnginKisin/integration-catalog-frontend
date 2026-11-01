import { FormField } from '../ui/FormField'
import { useState, useSyncExternalStore } from 'react'
import { useSession } from '../../auth/session'
import { useTask } from '../../hooks/useRequest'
import type { AccountLink } from '../../lib/account'
import { clearAccountLink, getAccountLink, subscribeAccountLink } from '../../lib/accountLinkStore'
import { navigateRoute } from '../../lib/navigation'
import { completeAccountAction } from '../../services/accountBackend'
import { ApiError } from '../../services/api'
import { TaskFeedback } from '../ui/feedback'
import { AuthLayout } from './AuthLayout'
const titles = { INVITATION: 'Daveti kabul et', PASSWORD_RESET: 'Yeni parola belirle', EMAIL_CHANGE: 'E-posta adresini doğrula' }

export function AccountActionPage() {
  const session = useSession()
  const link = useSyncExternalStore(subscribeAccountLink, getAccountLink, () => null)
  const [result, setResult] = useState<{ nonce: number; uncertain: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const active = link && link.nonce !== result?.nonce ? link : null
  return <AuthLayout title={active ? titles[active.purpose] : 'Hesap bağlantısı'} description="Hesap işleminizi tamamlayarak çalışma alanınıza devam edin." icon={active?.purpose === 'EMAIL_CHANGE' ? 'mail' : 'shield'}>
    {active ? <AccountActionForm key={active.nonce} link={active} disabled={session.loading || busy} onBusy={setBusy} onResult={(uncertain) => {
      if (getAccountLink()?.nonce === active.nonce) { setResult({ nonce: active.nonce, uncertain }); clearAccountLink(active.nonce) }
      if (!uncertain) session.requireLogin('Hesap işlemi tamamlandı. Hesabınızla yeniden giriş yapın.')
    }} /> : result ? <p role="status" className={result.uncertain ? 'error-panel' : 'success-panel'}>{result.uncertain ? 'Sunucu işleminin sonucu doğrulanamadı. Bağlantı otomatik tekrar kullanılmadı. İşlem tamamlanmış olabilir; giriş yapmayı deneyin. Gerekirse yeni parola sıfırlama bağlantısı isteyin; davet için yöneticinizle görüşün.' : 'Hesap işlemi tamamlandı. Giriş ekranından hesabınızla giriş yapabilirsiniz.'}</p> : <p role="alert" className="error-panel">Bağlantı bilgisi bulunamadı veya biçimi geçersiz. E-postadaki bağlantıyı yeniden açın. Sayfa yenilendiyse bağlantıyı tekrar açmanız gerekir; token yalnızca bellekte tutulur.</p>}
    <div className="flex flex-wrap gap-3"><button type="button" className="btn" disabled={busy} onClick={() => navigateRoute('/login')}>Giriş ekranına git</button><button type="button" className="btn" disabled={busy} onClick={() => navigateRoute('/forgot-password')}>Yeni sıfırlama bağlantısı iste</button></div>
  </AuthLayout>
}
function AccountActionForm({ link, disabled, onBusy, onResult }: { link: AccountLink; disabled: boolean; onBusy: (busy: boolean) => void; onResult: (uncertain: boolean) => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const task = useTask()
  const emailChange = link.purpose === 'EMAIL_CHANGE'
  return <form className="panel space-y-5" onSubmit={(event) => {
    event.preventDefault()
    if (disabled || task.busy) return
    void task.run(async () => {
      onBusy(true)
      try {
        await completeAccountAction(link, password, confirmation)
        setPassword(''); setConfirmation(''); onResult(false)
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) { setPassword(''); setConfirmation(''); onResult(true); return }
        throw error
      } finally { onBusy(false) }
    })
  }}><fieldset disabled={disabled || task.busy} className="space-y-5">
    {emailChange ? <p className="hint">Yeni e-posta adresini onaylamak için düğmeye basın. Mevcut adres onaydan sonra değişir ve ilgili hesabın oturumları kapanır.</p> : <>
      <p className="hint">Yeni parola 12–128 karakter olmalıdır. İşlem sonrası otomatik giriş yapılmaz.</p>
      <FormField label="Yeni parola" field="newPassword" error={task.error} className="label"><input className="field" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></FormField>
      <label className="label">Yeni parola tekrar<input className="field" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {confirmation && password !== confirmation && <p className="text-sm text-amber-200">Parolalar eşleşmiyor.</p>}
    </>}
    <TaskFeedback task={task} />
    {task.error instanceof ApiError && task.error.status === 400 && <p className="hint">Bağlantının süresi dolmuş veya daha önce kullanılmış olabilir. Davet için yöneticinizden, sıfırlama için giriş ekranından yeni bağlantı isteyin. E-posta değişikliğini Hesabım ekranından yeniden başlatabilirsiniz.</p>}
    <button className="btn-primary" disabled={disabled || task.busy || (!emailChange && (!password.trim() || password !== confirmation))}>{task.busy ? 'İşleniyor…' : emailChange ? 'Yeni adresi onayla' : 'Yeni parolayı kaydet'}</button>
  </fieldset></form>
}

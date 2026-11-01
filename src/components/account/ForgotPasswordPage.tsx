import { FormField } from '../ui/FormField'
import { useState } from 'react'
import { useTask } from '../../hooks/useRequest'
import { resetRequestMessage } from '../../lib/account'
import { navigateRoute } from '../../lib/navigation'
import { requestPasswordReset } from '../../services/accountBackend'
import { TaskFeedback } from '../ui/feedback'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const task = useTask()
  return <AuthLayout title="Parolamı unuttum" description="Hesabınıza bağlı doğrulanmış e-posta adresini girin. Sıfırlama bağlantısı 30 dakika geçerlidir." icon="mail">
    <form className="panel space-y-5" onSubmit={(event) => {
      event.preventDefault()
      void task.run(async () => { await requestPasswordReset(email); setEmail('') }, resetRequestMessage)
    }}><fieldset className="space-y-5" disabled={task.busy}>
      <FormField label="E-posta" field="email" error={task.error} className="label"><input className="field" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></FormField>
      <TaskFeedback task={task} />
      <button className="btn-primary" disabled={task.busy}>{task.busy ? 'İstek gönderiliyor…' : 'Sıfırlama bağlantısı iste'}</button>
    </fieldset></form>
    <p className="hint">İsteğin alınması postanın teslim edildiğini göstermez. Davetini henüz kabul etmemiş veya pasif hesaplar için yöneticinizle görüşün.</p>
    <button type="button" className="btn" disabled={task.busy} onClick={() => navigateRoute('/login')}>Giriş ekranına dön</button>
  </AuthLayout>
}

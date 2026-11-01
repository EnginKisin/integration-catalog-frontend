import { FormField } from '../ui/FormField'
import { useState } from 'react'
import { useSession } from '../../auth/session'
import { useTask } from '../../hooks/useRequest'
import { login } from '../../services/auth'
import { navigateRoute } from '../../lib/navigation'
import { ErrorPanel, TaskFeedback } from '../ui/feedback'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const session = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const task = useTask()

  return (
    <AuthLayout title="Entegrasyon Kataloğu" description="Çalışma alanınıza devam etmek için hesabınızla giriş yapın." icon="key">
      {session.notice && <p role="status" className="hint">{session.notice}</p>}
      <ErrorPanel error={session.error} />
      <form className="panel space-y-5" onSubmit={(event) => {
        event.preventDefault()
        void task.run(async () => {
          const profile = await login(username, password)
          setPassword('')
          session.setUser(profile)
          navigateRoute('/', true)
        })
      }}>
        <fieldset disabled={task.busy} className="space-y-5">
          <FormField label="Kullanıcı adı" field="username" error={task.error} className="label"><input className="field" autoComplete="username" autoFocus maxLength={100} required value={username} onChange={(event) => setUsername(event.target.value)} />
          </FormField>
          <FormField label="Parola" field="password" error={task.error} className="label"><input className="field" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </FormField>
          <TaskFeedback task={task} />
          <button className="btn-primary w-full" disabled={task.busy}>
            {task.busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </fieldset>
      </form>
      <button type="button" className="text-sm text-violet-300 underline" disabled={task.busy} onClick={() => { setPassword(''); navigateRoute('/forgot-password') }}>Parolamı unuttum</button>
      {(session.error || task.error) && (
        <button type="button" className="btn" disabled={task.busy} onClick={session.reload}>Oturumu / bağlantıyı yeniden kontrol et</button>
      )}
    </AuthLayout>
  )
}

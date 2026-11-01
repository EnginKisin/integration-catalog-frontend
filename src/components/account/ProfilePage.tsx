import { FormField } from '../ui/FormField'
import { useState } from 'react'
import { useSession } from '../../auth/session'
import { useTask } from '../../hooks/useRequest'
import { navigateRoute } from '../../lib/navigation'
import { permissionLabels } from '../../lib/account'
import { changeEmail, changePassword } from '../../services/accountBackend'
import { ApiError } from '../../services/api'
import { isAdmin } from '../../services/auth'
import { TaskFeedback } from '../ui/feedback'
import { AppIcon } from '../ui/AppIcon'
import { PageHeader, SectionHeader } from '../ui/PageLayout'

type Mode = 'password' | 'email'
export function ProfilePage({ onDirtyChange, onBusyChange }: { onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const session = useSession()
  const [mode, setMode] = useState<Mode>('password')
  const [dirty, setDirty] = useState(false)
  const [revision, setRevision] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const task = useTask()
  const user = session.user
  if (!user) return null
  const markDirty = () => { setDirty(true); onDirtyChange(true) }
  return <div className="app-page">
    <PageHeader eyebrow="KİŞİSEL AYARLAR" title="Hesabım" description="Hesap bilgilerinizi inceleyin, parolanızı ve e-posta adresinizi yönetin." />
    <div className="profile-layout">
    <section className="profile-card" aria-label="Hesap bilgileri"><span className="profile-avatar" aria-hidden="true">{user.username.slice(0, 2).toLocaleUpperCase('tr-TR')}</span><h2>{user.username}</h2><p className="profile-role">{user.authorities.map((role) => role.replace('ROLE_', '')).join(' · ')}</p><dl className="profile-properties"><div><dt><AppIcon name="mail" />E-posta</dt><dd>{user.email ?? 'Bağlı değil'}<span className={user.emailVerified ? 'profile-verified' : 'block text-[10px] text-amber-200'}>{user.emailVerified ? 'Doğrulanmış' : 'Doğrulanmamış'}</span></dd></div><div><dt><AppIcon name="shield" />Erişim bilgisi izinleri</dt><dd>{isAdmin(user) ? 'ADMIN görüntüleme ve değiştirme yetkisine sahiptir.' : user.permissions.map((permission) => permissionLabels[permission]).join(', ') || 'Yok'}</dd></div></dl>{!user.email && <p className="mt-3 text-xs leading-relaxed text-amber-200">Parola kurtarma kullanabilmek için e-posta bağlayıp doğrulayın.</p>}</section>
    <div className="min-w-0 space-y-4">
    <TaskFeedback task={task} />
    {uncertain && <div role="alert" className="error-panel space-y-3"><p>Hesap işleminin sonucu belirsiz. Tekrar göndermeden önce oturumunuzu kontrol edin. E-posta değişikliği istendiğinde gelen kutunuzu kontrol edin; parola değişmişse yeni parolanızla giriş yapın.</p><button type="button" className="btn" onClick={() => { session.requireLogin('Hesap işleminin sonucunu giriş yaparak kontrol edin.'); navigateRoute('/login', true) }}>Giriş ekranına dön</button></div>}
    <nav aria-label="Hesap işlemi" className="section-tabs">{(['password', 'email'] as const).map((value) => <button type="button" key={value} className="section-tab" disabled={task.busy || uncertain} aria-pressed={mode === value} onClick={() => {
      if (value === mode) return
      if (dirty && !window.confirm('Kaydedilmemiş hesap değişiklikleri bırakılacak. Devam edilsin mi?')) return
      setMode(value); setDirty(false); onDirtyChange(false)
    }}>{value === 'password' ? 'Parola değiştir' : 'E-posta bağla / değiştir'}</button>)}</nav>
    <ProfileForm key={`${mode}/${revision}`} mode={mode} busy={task.busy || uncertain} error={task.error} onDirty={markDirty} onSave={(current, value, confirmation) => task.run(async () => {
      onBusyChange(true)
      try {
        if (mode === 'password') {
          await changePassword(current, value, confirmation)
          session.requireLogin('Parolanız değiştirildi. Yeni parolanızla yeniden giriş yapın.'); navigateRoute('/login', true)
        } else {
          await changeEmail(current, value)
          setRevision((version) => version + 1); setDirty(false); onDirtyChange(false)
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
          setUncertain(true); setRevision((version) => version + 1); setDirty(false); onDirtyChange(false)
        }
        throw error
      } finally { onBusyChange(false) }
    }, mode === 'email' ? 'Doğrulama isteği alındı. Yeni adrese gelen bağlantıyı onaylayın. Mevcut adres onaya kadar korunur; onaydan sonra yeniden giriş gerekir.' : '')} />
    </div>
    </div>
  </div>
}
function ProfileForm({ mode, busy, error, onDirty, onSave }: { mode: Mode; busy: boolean; error?: Error; onDirty: () => void; onSave: (current: string, value: string, confirmation: string) => Promise<boolean> }) {
  const [current, setCurrent] = useState('')
  const [value, setValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  return <form className="profile-form panel" onChange={onDirty} onSubmit={(event) => { event.preventDefault(); if (!busy) void onSave(current, value, confirmation) }}><SectionHeader icon={mode === 'password' ? 'key' : 'mail'} title={mode === 'password' ? 'Parola güvenliği' : 'E-posta adresi'} description={mode === 'password' ? 'Hesabınıza giriş yapmak için kullandığınız parolayı güncelleyin.' : 'Hesap kurtarma ve bildirimler için kullanacağınız adresi doğrulayın.'} /><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
    <FormField label="Mevcut parola" field="currentPassword" error={error} className="label sm:col-span-2"><input className="field" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={(event) => setCurrent(event.target.value)} /></FormField>
    {mode === 'password' ? <>
      <p className="hint sm:col-span-2">Yeni parola 12–128 karakter olmalı ve mevcut paroladan farklı olmalıdır. Başarılı değişiklik tüm oturumlarınızı kapatır.</p>
      <FormField label="Yeni parola" field="newPassword" error={error} className="label"><input className="field" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={value} onChange={(event) => setValue(event.target.value)} /></FormField>
      <label className="label">Yeni parola tekrar<input className="field" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    </> : <FormField label="Yeni e-posta" field="email" error={error} className="label sm:col-span-2"><input className="field" type="email" autoComplete="email" maxLength={254} required value={value} onChange={(event) => setValue(event.target.value)} /></FormField>}
    <button className="btn-primary justify-self-start sm:col-span-2" disabled={busy || (mode === 'password' && (value !== confirmation || !value.trim() || value === current))}>{busy ? 'İşleniyor…' : mode === 'password' ? 'Parolayı değiştir' : 'Doğrulama bağlantısı iste'}</button>
  </fieldset></form>
}

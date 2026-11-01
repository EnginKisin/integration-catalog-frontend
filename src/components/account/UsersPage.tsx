import { FormField } from '../ui/FormField'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSession } from '../../auth/session'
import { useResource, useTask } from '../../hooks/useRequest'
import { invalidatesUserSession, isCurrentAccount, permissionDescriptions, permissionLabels, permissions, roleDescriptions, roleLabels, roles, userActionLabels } from '../../lib/account'
import type { InvitationInput, UserAction } from '../../lib/account'
import { navigateRoute } from '../../lib/navigation'
import { ApiError } from '../../services/api'
import { isAdmin } from '../../services/auth'
import { fetchMailStatus, fetchUsers, forcePasswordReset, inviteUser, resendInvitation, revokeUserSessions, setUserActive, setUserPermissions, setUserRole } from '../../services/usersBackend'
import type { Permission, Role, UserAccount, UserPage } from '../../types/account'
import { Empty, ErrorPanel, Loading, TaskFeedback } from '../ui/feedback'
import { UserTable } from './UserTable'
import { AccessGuide } from './AccessGuide'
import { AppIcon } from '../ui/AppIcon'
import { PageHeader, SectionHeader } from '../ui/PageLayout'

type Panel = { kind: 'invite' } | { kind: UserAction; user: UserAccount }
interface Props { onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }
const messages: Record<UserAction | 'invite', string> = {
  invite: 'Davet oluşturuldu ve posta kuyruğuna alındı. Bu yanıt teslimat onayı değildir; kullanıcı bağlantıdan parolasını belirlemelidir.',
  role: 'Rol güncellendi. İlgili kullanıcının önceki oturumları geçersizleşti.', permissions: 'Erişim izinleri güncellendi. İlgili kullanıcının önceki oturumları geçersizleşti.',
  active: 'Aktiflik güncellendi. İlgili kullanıcının önceki oturumları geçersizleşti.', resend: 'Yeni davet posta kuyruğuna alındı. Önceki davet bağlantısı geçersizdir.',
  reset: 'Sıfırlama isteği alındı. Eski parola ve oturumlar kapatıldı; kullanıcı e-posta bağlantısından yeni parola belirlemelidir.', revoke: 'Kullanıcının önceki oturumları kapatıldı.',
}

export function UsersPage(props: Props) {
  const { user } = useSession()
  if (!user || !isAdmin(user)) return <Empty>Kullanıcı yönetimi yalnızca ADMIN için açıktır.</Empty>
  return <AdminUsersPage {...props} />
}
function AdminUsersPage(props: Props) {
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  return <div className="app-page mx-auto w-full max-w-7xl"><PageHeader eyebrow="EKİP VE ERİŞİM" title="Kullanıcı yönetimi" description="Hesapları, rolleri ve erişim izinlerini yönetin. Yeni kullanıcılar davetle katılır." /><AccessGuide /><UserPageLoader key={`${page}/${size}`} {...props} page={page} size={size} onPage={setPage} onSize={(value) => { setSize(value); setPage(0) }} /></div>
}
interface PageProps extends Props { page: number; size: number; onPage: (page: number) => void; onSize: (size: number) => void }
function UserPageLoader(props: PageProps) {
  const load = useCallback(() => fetchUsers(props.page, props.size), [props.page, props.size])
  const resource = useResource(load)
  if (resource.loading) return <Loading />
  if (resource.error || !resource.data) return <div className="space-y-4"><ErrorPanel error={resource.error} /><button type="button" className="btn" onClick={resource.reload}>Kullanıcı listesini yeniden oku</button>{props.page > 0 && <button type="button" className="btn" onClick={() => props.onPage(props.page - 1)}>Önceki sayfa</button>}</div>
  return <UserManagement {...props} initial={resource.data} />
}
function UserManagement({ initial, ...props }: PageProps & { initial: UserPage }) {
  const session = useSession()
  const [data, setData] = useState(initial)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [panelVersion, setPanelVersion] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [stale, setStale] = useState(false)
  const task = useTask()
  const mail = useResource(fetchMailStatus)
  const blocked = task.busy || stale
  const clearDirty = () => { setDirty(false); props.onDirtyChange(false) }
  const mayLeave = () => !dirty || window.confirm('Kaydedilmemiş kullanıcı değişiklikleri bırakılacak. Devam edilsin mi?')
  const open = (next: Panel | null) => { if (!mayLeave()) return; setPanel(next); setPanelVersion((value) => value + 1); clearDirty() }
  const refresh = () => {
    if (!mayLeave()) return
    void task.run(async () => {
      props.onBusyChange(true)
      try { setData(await fetchUsers(props.page, props.size)); setStale(false); setPanel(null); clearDirty(); mail.reload() }
      finally { props.onBusyChange(false) }
    }, 'Kullanıcı listesi yenilendi.')
  }
  const submit = (action: () => Promise<unknown>, currentPanel: Panel) => task.run(async () => {
    if (stale) return
    props.onBusyChange(true)
    try {
      try { await action() }
      catch (error) { if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) setStale(true); throw error }
      if (currentPanel.kind !== 'invite' && invalidatesUserSession(currentPanel.kind) && isCurrentAccount(currentPanel.user, session.user!.username)) {
        clearDirty(); session.requireLogin('Kendi hesabınızın oturumunu etkileyen işlem tamamlandı. Yeniden giriş yapın.'); navigateRoute('/login', true); return
      }
      try { setData(await fetchUsers(props.page, props.size)); setPanel(null); clearDirty(); mail.reload() }
      catch { setStale(true); throw new Error('İşlem kaydedildi fakat güncel liste okunamadı. Tekrar işlem yapmadan önce kullanıcı listesini yeniden okuyun.') }
    } finally { props.onBusyChange(false) }
  }, messages[currentPanel.kind])
  return <div className="space-y-4">
    <TaskFeedback task={task} />
    {stale && <p role="alert" className="error-panel">Son işlemin sonucu doğrulanamadı. Kullanıcı listesini yeniden okuyana kadar yeni değişiklik gönderilemez. Posta işlemi yaptıysanız teslimat durumunu ayrıca kontrol edin.</p>}
    <section aria-label="Davet e-postaları" className="account-toolbar">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><h2 className="font-semibold text-slate-200">Posta kuyruğu</h2>{mail.loading && <span role="status" className="text-slate-400">Yükleniyor…</span>}{mail.data && <><span className="text-slate-400">Bekleyen <strong className="ml-1 font-medium tabular-nums text-slate-200">{mail.data.pending}</strong></span><span className={mail.data.failed > 0 ? 'text-amber-200' : 'text-slate-400'}>Başarısız <strong className="ml-1 font-medium tabular-nums">{mail.data.failed}</strong></span></>}</div><p className="text-[11px] text-slate-500">Kuyruk bilgileri teslimat onayı değildir. Gerekirse işlem menüsünden yeniden davet gönderin.</p></div><button type="button" className="btn" disabled={mail.loading || task.busy} onClick={mail.reload}>Kuyruğu yenile</button></div>
      <ErrorPanel error={mail.error} />
    </section>
    <SectionHeader icon="users" title={`Kullanıcılar · ${data.totalElements}`} description="Hesap işlemlerine satır sonundaki üç nokta menüsünden ulaşabilirsiniz." actions={<><button type="button" className="btn" disabled={task.busy} onClick={refresh}><AppIcon name="refresh" />{stale ? 'Kullanıcı listesini yeniden oku' : 'Listeyi yenile'}</button><button type="button" className="btn-primary" disabled={blocked} onClick={() => open({ kind: 'invite' })}><AppIcon name="plus" /> Kullanıcı davet et</button></>} />
    <UserTable users={data.items} currentUsername={session.user?.username} disabled={blocked} onAction={(kind, user) => open({ kind, user })}>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-xs text-slate-400"><p aria-live="polite">{data.items.length ? data.page * data.size + 1 : 0}–{data.page * data.size + data.items.length} / {data.totalElements} kullanıcı</p><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2">Sayfa başına<select className="field w-auto" disabled={blocked} value={props.size} onChange={(event) => { if (mayLeave()) { clearDirty(); props.onSize(Number(event.target.value)) } }}>{[20, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label><span className="tabular-nums">{data.page + 1} / {Math.max(1, data.totalPages)}</span><button type="button" className="btn" aria-label="Önceki sayfa" disabled={blocked || data.page <= 0} onClick={() => { if (mayLeave()) { clearDirty(); props.onPage(data.page - 1) } }}>←</button><button type="button" className="btn" aria-label="Sonraki sayfa" disabled={blocked || data.page + 1 >= data.totalPages} onClick={() => { if (mayLeave()) { clearDirty(); props.onPage(data.page + 1) } }}>→</button></div></footer>
    </UserTable>
    {panel && <UserActionPanel key={panelVersion} panel={panel} self={panel.kind !== 'invite' && panel.user.username === session.user?.username} busy={task.busy} disabled={stale} error={task.error} onDirty={() => { setDirty(true); props.onDirtyChange(true) }} onCancel={() => open(null)} onSubmit={(action) => submit(action, panel)} />}
  </div>
}
function UserActionPanel({ panel, self, busy, disabled, error, onDirty, onCancel, onSubmit }: { panel: Panel; self: boolean; busy: boolean; disabled: boolean; error?: Error; onDirty: () => void; onCancel: () => void; onSubmit: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const account = panel.kind === 'invite' ? null : panel.user
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const accountId = useId()
  const roleHelpId = useId()
  const permissionHelpId = useId()
  const [attempted, setAttempted] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(account?.role ?? 'VIEWER')
  const [selectedPermissions, setPermissions] = useState<Permission[]>(account?.permissions ?? [])
  const title = panel.kind === 'invite' ? 'Yeni kullanıcı daveti' : panel.kind === 'active' ? panel.user.active ? 'Kullanıcıyı pasifleştir' : 'Kullanıcıyı aktifleştir' : userActionLabels[panel.kind]
  const destructive = panel.kind === 'reset' || panel.kind === 'revoke' || (panel.kind === 'active' && panel.user.active)
  const submitLabel = panel.kind === 'invite' ? 'Davet oluştur' : panel.kind === 'role' || panel.kind === 'permissions' ? 'Değişiklikleri kaydet' : panel.kind === 'active' ? panel.user.active ? 'Pasifleştir' : 'Aktifleştir' : panel.kind === 'resend' ? 'Daveti gönder' : panel.kind === 'reset' ? 'Sıfırlamayı başlat' : 'Oturumları kapat'
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const field = dialog?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')
    const initialFocus = field ?? cancelRef.current
    initialFocus?.focus()
    return () => dialog?.close()
  }, [])
  const noChanges = panel.kind === 'role' ? role === account?.role : panel.kind === 'permissions' ? permissions.every((value) => selectedPermissions.includes(value) === account?.permissions.includes(value)) : false
  const perform = () => {
    if (panel.kind === 'invite') return inviteUser({ username, email, role } satisfies InvitationInput)
    const id = panel.user.id
    switch (panel.kind) {
      case 'role': return setUserRole(id, role)
      case 'permissions': return setUserPermissions(id, selectedPermissions)
      case 'active': return setUserActive(id, !panel.user.active)
      case 'resend': return resendInvitation(id)
      case 'reset': return forcePasswordReset(id)
      case 'revoke': return revokeUserSessions(id)
    }
  }
  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={account ? accountId : undefined} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl border border-white/15 bg-[#0c0f18] p-5 text-slate-100 shadow-2xl backdrop:bg-black/60" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
    <header><h2 id={titleId} className="text-base font-semibold">{title}</h2>{account && <p id={accountId} className="mt-1 break-all text-sm text-slate-400">{account.username} <span className="text-slate-500">· #{account.id}{self ? ' · Siz' : ''}</span></p>}</header>
    {attempted && <ErrorPanel error={error} />}
    {disabled && <p role="alert" className="error-panel">Sonuç doğrulanamadı. Bu pencereyi kapatıp kullanıcı listesini yeniden okuyun.</p>}
    {self && panel.kind !== 'resend' && <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">Bu işlem kendi hesabınızın oturumunu kapatabilir. Başarılı değişiklik sonrası yeniden giriş gerekir.</p>}
    <form className="space-y-4" onChange={onDirty} onSubmit={(event) => {
      event.preventDefault()
      if (busy || disabled || noChanges) return
      setAttempted(true)
      void onSubmit(perform)
    }}>
    <fieldset disabled={busy || disabled} className="space-y-4">
      {panel.kind === 'invite' && <><p className="hint">Kullanıcı parolasını 24 saat geçerli davet bağlantısında kendisi belirler.</p><FormField label="Kullanıcı adı" field="username" error={attempted ? error : undefined} className="label"><input className="field" required maxLength={100} pattern="[a-zA-Z0-9._-]+" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></FormField><FormField label="E-posta" field="email" error={attempted ? error : undefined} className="label"><input className="field" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></FormField></>}
      {(panel.kind === 'invite' || panel.kind === 'role') && <div className="space-y-2">
        <FormField label="Rol" field="role" error={attempted ? error : undefined} className="label"><select className="field" aria-describedby={roleHelpId} value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]} ({value})</option>)}</select></FormField>
        <div id={roleHelpId} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"><p className="text-xs leading-relaxed text-slate-300">{roleDescriptions[role]}</p>{role !== 'ADMIN' && <p className="hint">Bu rol kayıtlı parola ve API anahtarlarını görme yetkisini otomatik vermez. {panel.kind === 'invite' ? 'Davetten sonra kullanıcının işlem menüsündeki “Erişim izinleri” bölümünden ek izin verebilirsiniz.' : 'Ek izinler “Erişim izinleri” bölümünden ayrı yönetilir.'}</p>}</div>
      </div>}
      {panel.kind === 'permissions' && <>
        <div className="space-y-1 rounded-lg border border-violet-400/20 bg-violet-400/5 p-3"><p className="text-xs font-medium text-violet-200">Mevcut rol: {roleLabels[panel.user.role]}</p><p className="text-xs leading-relaxed text-slate-300">{panel.user.role === 'ADMIN' ? 'Yönetici bu iki yetkiye otomatik sahiptir. Aşağıdaki ek izin seçimleri, kullanıcı başka bir role geçtiğinde geçerli olur; değiştirme izni editör rolü gerektirir.' : panel.user.role === 'VIEWER' ? 'Bu kullanıcı kayıtları yalnızca görüntüleyebilir. Bağlantı bilgilerini görmesi için görüntüleme izni verebilirsiniz. Değiştirme izni seçili olsa da bu rolde kullanılamaz; önce rolünü Editör yapmanız gerekir.' : 'Bu kullanıcı entegrasyonları düzenleyebilir. Kayıtlı parola ve API anahtarlarını görüp değiştirebilmesi aşağıdaki ek izinlere bağlıdır.'}</p></div>
        <p className="hint">Bu izinler entegrasyonların bağlantı bilgileri içindir; kullanıcının kendi giriş parolasını kapsamaz.</p>
        <div role="group" aria-label="Bağlantı bilgisi izinleri" className="space-y-2">{permissions.map((permission) => <label key={permission} className="flex items-start gap-3 rounded-lg border border-white/10 p-3"><input type="checkbox" className="mt-0.5" aria-label={permissionLabels[permission]} aria-describedby={`${permissionHelpId}-${permission}`} checked={selectedPermissions.includes(permission)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission] : current.filter((value) => value !== permission))} /><span className="min-w-0"><span className="block text-sm font-medium text-slate-200">{permissionLabels[permission]}</span><span id={`${permissionHelpId}-${permission}`} className="mt-1 block text-xs leading-relaxed text-slate-400">{permissionDescriptions[permission]}</span>{permission === 'MANAGE_CREDENTIALS' && panel.user.role === 'VIEWER' && <span className="mt-1 block text-xs text-amber-200">Mevcut rolde etkisiz · Editör rolü gerekir</span>}</span></label>)}</div>
        <p className="hint">{panel.user.role === 'ADMIN' ? 'Ek seçimleri kaldırmak yöneticinin rolünden gelen yetkileri kaldırmaz.' : 'İki seçeneği de kaldırırsanız bağlantı bilgilerine ek erişim verilmez.'}</p>
      </>}
      {panel.kind === 'active' && <p className="hint">Hesap {panel.user.active ? 'pasifleştirilecek; mevcut oturumlar kapanır ve yeni giriş engellenir' : 'aktifleştirilecek; davet/doğrulama ve parola kuralları ayrıca geçerlidir'}. Son giriş yapabilen ADMIN için korumayı sunucu kontrol eder.</p>}
      {panel.kind === 'role' && <p className="hint">Rol değişikliği mevcut oturumları kapatır. Son giriş yapabilen ADMIN rolünün düşürülmesi sunucu tarafından engellenir.</p>}
      {panel.kind === 'resend' && <p className="hint">Önceki davet bağlantısı geçersiz kılınır ve yeni davet kuyruğa alınır. Aynı hesap için en az 60 saniye aralık gerekir.</p>}
      {panel.kind === 'reset' && <p className="text-sm text-amber-200">Eski parola ve bütün oturumlar hemen kapatılacak. Kullanıcı bağlantıdan yeni parola belirleyene kadar giriş yapamaz. Son aktif ADMIN bu yolla kilitlenemez.</p>}
      {panel.kind === 'revoke' && <p className="text-sm text-amber-200">Bu kullanıcının bütün mevcut oturumları kapatılacak. Parolası ve hesabın aktifliği korunur.</p>}
    </fieldset>
    <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4"><button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={onCancel}>{disabled ? 'Kapat' : 'Vazgeç'}</button><button type="submit" className={destructive ? 'btn-danger' : 'btn-primary'} disabled={busy || disabled || noChanges}>{busy ? 'İşleniyor…' : submitLabel}</button></footer>
    </form>
  </dialog>
}

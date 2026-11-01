import type { ReactNode } from 'react'
import { permissionLabels, roleDescriptions, roleLabels, userActionLabels } from '../../lib/account'
import type { UserAction } from '../../lib/account'
import type { UserAccount } from '../../types/account'
import { Badge } from '../ui/badge'
import { RowActions } from '../ui/RowActions'

interface Props {
  users: UserAccount[]
  currentUsername?: string
  disabled: boolean
  onAction: (kind: UserAction, user: UserAccount) => void
  children: ReactNode
}

const roleClasses = {
  ADMIN: 'bg-violet-400/10 text-violet-200 ring-violet-400/20',
  EDITOR: 'bg-sky-400/10 text-sky-200 ring-sky-400/20',
  VIEWER: 'bg-white/5 text-slate-300 ring-white/10',
}
const actions: UserAction[] = ['role', 'permissions', 'resend', 'active', 'reset', 'revoke']

export function UserTable({ users, currentUsername, disabled, onAction, children }: Props) {
  return <section aria-label="Kullanıcı listesi" className="data-table-shell min-w-0 overflow-hidden border">
    <div className="overflow-x-auto focus-visible:outline focus-visible:outline-violet-400" role="region" aria-label="Kullanıcı tablosu, tüm sütunlar için yatay kaydırabilirsiniz" tabIndex={0}>
      <table className="catalog-table w-full min-w-[56rem] text-left text-xs text-slate-300">
        <caption className="sr-only">Kullanıcılar. Hesap işlemleri için satırın sonundaki üç nokta menüsünü kullanın.</caption>
        <thead className="bg-white/[0.04] text-slate-400"><tr>
          {['Kullanıcı', 'E-posta', 'Rol', 'Hesap durumu', 'Erişim izinleri'].map((label) => <th key={label} scope="col" className="whitespace-nowrap font-medium">{label}</th>)}
          <th scope="col" className="w-20 text-right font-medium">İşlemler</th>
        </tr></thead>
        <tbody>{users.length === 0 ? <tr><td colSpan={6} className="text-center"><div className="py-10"><p className="text-sm font-semibold text-white">Bu sayfada kullanıcı yok</p><p className="hint mt-1">Yeni bir kullanıcı davet edebilir veya önceki sayfaya dönebilirsiniz.</p></div></td></tr> : users.map((account) => <tr key={account.id} className="border-t border-white/[0.06] transition-colors hover:bg-violet-400/[0.04] focus-within:bg-violet-400/[0.04]">
          <th scope="row" className="min-w-48 font-normal"><div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-[11px] font-semibold text-violet-200">{account.username.slice(0, 2).toLocaleUpperCase('tr-TR')}</span>
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="block max-w-48 truncate text-[13px] font-medium text-white" title={account.username}>{account.username}</span>{account.username === currentUsername && <Badge variant="muted">Siz</Badge>}</div><p className="mt-0.5 text-[11px] text-slate-500">#{account.id}</p></div>
          </div></th>
          <td className="min-w-52"><p className="max-w-64 truncate text-slate-200" title={account.email ?? undefined}>{account.email ?? 'E-posta bağlı değil'}</p><p className={`mt-1 text-[11px] ${account.email && !account.emailVerified ? 'text-amber-200' : 'text-slate-500'}`}>{account.email ? account.emailVerified ? 'Doğrulandı' : 'Doğrulanmadı' : 'Davet ve parola e-postaları gönderilemez'}</p></td>
          <td><span title={`${account.role}: ${roleDescriptions[account.role]}`} className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${roleClasses[account.role]}`}>{roleLabels[account.role]}</span></td>
          <td className="min-w-40"><Badge variant={account.active ? 'success' : 'muted'}>{account.active ? 'Aktif' : 'Pasif'}</Badge>{account.passwordResetRequired && <p className="mt-1.5 text-[11px] text-amber-200">Parola sıfırlama gerekli</p>}</td>
          <td className="min-w-52">{account.role === 'ADMIN' ? <div className="text-xs text-violet-200">Görüntüleme ve değiştirme<span className="mt-1 block text-[11px] text-slate-500">Yönetici rolünden otomatik</span></div> : account.permissions.length ? <ul className="space-y-1 text-[11px]">{account.permissions.map((permission) => <li key={permission} className={permission === 'MANAGE_CREDENTIALS' && account.role === 'VIEWER' ? 'text-slate-500' : 'text-slate-300'}>{permissionLabels[permission]}{permission === 'MANAGE_CREDENTIALS' && account.role === 'VIEWER' && <span className="block text-[10px]">Mevcut rolde etkisiz · Editör rolü gerekir</span>}</li>)}</ul> : <span className="text-slate-500">Ek izin yok</span>}</td>
          <td className="text-right"><RowActions label={`${account.username} işlemleri`} disabled={disabled} items={actions.map((kind) => {
            const needsEmail = kind === 'resend' || kind === 'reset'
            const unavailable = (needsEmail && !account.email) || (kind === 'resend' && account.emailVerified)
            return {
              id: kind, label: kind === 'active' ? account.active ? 'Pasifleştir' : 'Aktifleştir' : userActionLabels[kind],
              onSelect: () => onAction(kind, account), disabled: unavailable,
              disabledReason: !account.email ? 'Hesaba bağlı bir e-posta yok.' : 'E-posta zaten doğrulanmış.',
              separatorBefore: kind === 'resend' || kind === 'active',
              danger: kind === 'reset' || kind === 'revoke' || (kind === 'active' && account.active),
            }
          })} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    {children}
  </section>
}

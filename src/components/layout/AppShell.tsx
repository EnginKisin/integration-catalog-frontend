import type { PropsWithChildren } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../auth/session'
import { canEdit, isAdmin } from '../../services/auth'
import { version as appVersion } from '../../../package.json'
import { AppIcon, type IconName } from '../ui/AppIcon'
import { Brand } from '../ui/PageLayout'

export type AppView = 'dashboard' | 'flows' | 'create' | 'systems' | 'integration' | 'profile' | 'users'

interface AppShellProps extends PropsWithChildren {
  view: AppView
  onNavigate: (view: AppView) => void
  navigationDisabled?: boolean
  integrationOrigin?: 'dashboard' | 'flows'
}

const navItems: { id: AppView; label: string; description: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Entegrasyonlar', description: 'Katalog ve ayrıntılar', icon: 'catalog' },
  { id: 'flows', label: 'Akış Haritası', description: 'Sistem bağlantıları ve görsel çıktılar', icon: 'flow' },
  { id: 'create', label: 'Yeni Entegrasyon', description: 'Servis tanımı ekle', icon: 'plus' },
  { id: 'systems', label: 'Sistemler', description: 'Ortak sistem kataloğu', icon: 'server' },
  { id: 'users', label: 'Kullanıcılar', description: 'Davet, roller ve oturumlar', icon: 'users' },
  { id: 'profile', label: 'Hesabım', description: 'Parola ve e-posta', icon: 'user' },
]

export function AppShell({ view, onNavigate, children, navigationDisabled = false, integrationOrigin = 'dashboard' }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const accountButtonRef = useRef<HTMLButtonElement>(null)
  const { user, signOut } = useSession()

  useEffect(() => {
    if (!accountOpen) return

    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false)
        accountButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountOpen])

  const navigate = (next: AppView) => {
    onNavigate(next)
    setMobileOpen(false)
    setAccountOpen(false)
  }

  return (
    <div className="app-shell min-h-screen text-slate-100 lg:flex">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto border-r px-3 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-2"><Brand /></div>
        <p className="sidebar-heading">ÇALIŞMA ALANI</p>

        <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">
          {navItems.filter((item) => (item.id !== 'create' || (user && canEdit(user))) && (item.id !== 'users' || (user && isAdmin(user)))).map((item) => {
            const active = view === item.id || (view === 'integration' && item.id === integrationOrigin)
            return (
              <button
                key={item.id}
                type="button"
                disabled={navigationDisabled}
                aria-current={active ? 'page' : undefined}
                title={item.description}
                onClick={() => navigate(item.id)}
                className="sidebar-nav-item"
              >
                <AppIcon name={item.icon} />
                <span className="block text-[13px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-note"><AppIcon name="link" /><strong>Bağlantılara ortak bir bakış</strong><p>Sistemler, ortamlar ve veri akışları aynı çalışma alanında.</p></div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 px-2 pt-3 text-xs text-slate-500">
          <p>Web sürümü</p>
          <p className="font-medium tabular-nums text-slate-300">v{appVersion}</p>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="app-topbar flex min-h-16 items-center justify-between gap-3 border-b px-4 py-2 lg:px-7">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="btn lg:hidden"
          >
            <AppIcon name="menu" />Menü
          </button>
          <p className="hidden text-xs text-slate-500 lg:block">Katalog <span aria-hidden="true" className="px-2">/</span><span className="text-slate-300">{view === 'integration' ? 'Entegrasyon ayrıntısı' : navItems.find((item) => item.id === view)?.label}</span></p>
          <div
            ref={accountRef}
            className="relative min-w-0"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false)
            }}
          >
            <button
              ref={accountButtonRef}
              type="button"
              className="btn max-w-full border-transparent bg-transparent"
              aria-label={`Kullanıcı menüsü: ${user?.username ?? 'Hesabım'}`}
              aria-expanded={accountOpen}
              aria-controls="account-dropdown"
              onClick={() => setAccountOpen((open) => !open)}
            >
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-200">
                {user?.username.slice(0, 1).toLocaleUpperCase('tr-TR') || 'H'}
              </span>
              <span className="max-w-40 truncate">{user?.username ?? 'Hesabım'}</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 shrink-0 transition-transform ${accountOpen ? 'rotate-180' : ''}`}>
                <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {accountOpen && (
              <div id="account-dropdown" className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0c0f18] p-2 shadow-xl shadow-black/30">
                <div className="border-b border-white/10 px-3 py-3">
                  <p className="break-all text-sm font-semibold text-white">{user?.username}</p>
                  <p className="mt-1 break-words text-xs text-slate-400">{user?.authorities.map((role) => role.replace('ROLE_', '')).join(', ')}</p>
                </div>
                <button type="button" disabled={navigationDisabled} onClick={() => navigate('profile')} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-violet-400 disabled:opacity-40">
                  <AppIcon name="user" />Hesabım
                </button>
                <button type="button" disabled={navigationDisabled} onClick={() => { setAccountOpen(false); void signOut() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-rose-300 hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-violet-400 disabled:opacity-40">
                  <AppIcon name="logout" />Çıkış yap
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="app-content min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}

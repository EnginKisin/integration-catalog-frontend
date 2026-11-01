import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { IntegrationTable } from './components/dashboard/IntegrationTable'
import { CreateIntegration } from './components/dashboard/CreateIntegration'
import { SystemsPage } from './components/dashboard/SystemsPage'
import { AppShell, type AppView } from './components/layout/AppShell'
import { fetchIntegrations } from './services/integrationsBackend'
import type { IntegrationRecord } from './types/integration'
import { useSession } from './auth/session'
import { LoginPage } from './components/account/LoginPage'
import { ErrorPanel, Loading } from './components/ui/feedback'
import { useResource } from './hooks/useRequest'
import { canEdit, isAdmin } from './services/auth'
import { IntegrationWorkspace } from './components/dashboard/IntegrationWorkspace'
import { AccountActionPage } from './components/account/AccountActionPage'
import { ForgotPasswordPage } from './components/account/ForgotPasswordPage'
import { ProfilePage } from './components/account/ProfilePage'
import { UsersPage } from './components/account/UsersPage'
import { getPath, subscribePath } from './lib/navigation'
import type { SaveIntent } from './lib/integrationWorkflow'
import { AppIcon } from './components/ui/AppIcon'
import { MetricCard, PageHeader } from './components/ui/PageLayout'
import { FlowMapPage } from './components/dashboard/FlowMapPage'
import { emptyFlowFilters } from './lib/flowMap'

function App() {
  const session = useSession()
  const path = useSyncExternalStore(subscribePath, getPath, () => '/')
  if (path === '/account/action') return <AccountActionPage />
  if (path === '/forgot-password') return <ForgotPasswordPage />
  if (session.loading) return <Loading />
  if (path === '/login') return <LoginPage />
  if (!session.user) return <LoginPage />
  return <CatalogApp key={session.user.username} />
}

function CatalogApp() {
  const { user } = useSession()
  const resource = useResource(fetchIntegrations)
  const integrationList = useMemo(() => resource.data ?? [], [resource.data])
  const editable = user != null && canEdit(user)
  const [view, setView] = useState<AppView>('dashboard')
  const [workspaceOrigin, setWorkspaceOrigin] = useState<'dashboard' | 'flows'>('dashboard')
  const [flowFilters, setFlowFilters] = useState({ ...emptyFlowFilters })
  const [selectedId, setSelectedId] = useState<string>()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [syncFilter, setSyncFilter] = useState('all')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [sort, setSort] = useState('updated')
  const [workspaceDirty, setWorkspaceDirty] = useState(false)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [newlyCreated, setNewlyCreated] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!workspaceDirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [workspaceDirty])

  const navigate = (next: AppView) => {
    if (workspaceBusy) return
    if (next !== view && workspaceDirty && !window.confirm('Kaydedilmemiş değişiklikler bırakılacak. Devam edilsin mi?')) return
    setWorkspaceDirty(false)
    if (next === 'create') setWorkspaceOrigin('dashboard')
    setView(next)
    if (next === 'dashboard' || next === 'flows') resource.reload()
  }

  const savedExit = () => {
    setWorkspaceDirty(false); setWorkspaceBusy(false); setSelectedId(undefined); setNewlyCreated(false)
    setNotice('Bilgiler kaydedildi. Kayıt üzerinden istediğiniz zaman devam edebilirsiniz.')
    setView(workspaceOrigin); resource.reload()
  }
  const handleCreated = (newRecord: IntegrationRecord, intent: SaveIntent) => {
    if (intent === 'exit') { savedExit(); return }
    setSelectedId(newRecord.id)
    setNewlyCreated(true)
    setView('integration')
    resource.reload()
  }

  const openIntegration = (id: string, origin: 'dashboard' | 'flows') => {
    setSelectedId(id); setNewlyCreated(false); setWorkspaceOrigin(origin); setView('integration')
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    const matches = integrationList.filter((item) =>
      (statusFilter === 'all' || item.status === statusFilter) &&
      (syncFilter === 'all' || item.syncType === syncFilter) &&
      (!reviewOnly || item.reviewRequired) &&
      [item.id, item.serviceName, item.description, item.sourceSystem, item.destinationSystem, item.middleware]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(needle),
    )
    return matches.sort((a, b) => sort === 'name'
      ? a.serviceName.localeCompare(b.serviceName, 'tr')
      : (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '') || Number(b.id) - Number(a.id))
  }, [integrationList, query, statusFilter, syncFilter, reviewOnly, sort])

  const hasFilters = Boolean(query || statusFilter !== 'all' || syncFilter !== 'all' || reviewOnly)
  const clearFilters = () => { setQuery(''); setStatusFilter('all'); setSyncFilter('all'); setReviewOnly(false) }

  const completedCount = integrationList.filter((item) => item.status === 'COMPLETED').length
  const middlewareCount = integrationList.filter((item) => item.hasMiddleware || item.middleware).length
  const asyncCount = integrationList.filter((item) => item.syncType === 'async').length

  return (
    <AppShell view={view} onNavigate={navigate} navigationDisabled={workspaceBusy} integrationOrigin={workspaceOrigin}>
      {view === 'create' && editable && <CreateIntegration onCreated={handleCreated} onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} onCancel={() => navigate('dashboard')} />}

      {view === 'flows' && <FlowMapPage records={integrationList} loading={resource.loading} error={resource.error} filters={flowFilters} onFiltersChange={setFlowFilters} onReload={resource.reload} onOpenIntegration={(id) => openIntegration(id, 'flows')} />}

      {view === 'systems' && <SystemsPage onChanged={resource.reload} onBack={() => navigate('dashboard')} onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} />}

      {view === 'profile' && <ProfilePage onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} />}
      {view === 'users' && user && isAdmin(user) && <UsersPage onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} />}

      {view === 'integration' && selectedId && <IntegrationWorkspace key={selectedId} id={selectedId} newlyCreated={newlyCreated} backLabel={workspaceOrigin === 'flows' ? 'Akış haritasına dön' : 'Listeye dön'} onSavedExit={savedExit} onChanged={resource.reload} onDirtyChange={setWorkspaceDirty} onBusyChange={setWorkspaceBusy} onBack={() => navigate(workspaceOrigin)} onDeleted={() => { setSelectedId(undefined); setWorkspaceDirty(false); setView(workspaceOrigin); resource.reload() }} />}

      {view === 'dashboard' && (
        <div className="app-page">
          {notice && <div role="status" className="success-panel flex items-center justify-between gap-3"><p>{notice}</p><button type="button" className="btn" aria-label="Bildirimi kapat" onClick={() => setNotice('')}>×</button></div>}
          <PageHeader eyebrow="SERVİS KATALOĞU" title="Entegrasyonlar" description="Sistemleriniz arasındaki bağlantıları, veri akışlarını ve yapılandırmaları tek yerden yönetin." actions={<>
              <button type="button" className="btn" disabled={resource.loading} onClick={resource.reload}><AppIcon name="refresh" />Yenile</button>
              {editable && <button
                type="button"
                onClick={() => { setWorkspaceOrigin('dashboard'); setView('create') }}
                className="btn-primary"
              >
                <AppIcon name="plus" /> Yeni entegrasyon
              </button>}
          </>} />

          <section aria-label="Katalog özeti" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Toplam" value={integrationList.length} icon="catalog" detail="entegrasyon kayıtlı" />
            <MetricCard label="Tamamlanan" value={completedCount} icon="check" tone="green" detail="katalog kaydı hazır" />
            <MetricCard label="Ara katmanlı" value={middlewareCount} icon="layers" tone="blue" detail="ara katman üzerinden" />
            <MetricCard label="Asenkron" value={asyncCount} icon="clock" tone="amber" detail="yanıt beklemeyen akış" />
          </section>

          <section aria-label="Liste filtreleri" className="data-toolbar flex flex-wrap items-center gap-2">
            <input aria-label="Entegrasyon ara" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Servis, sistem veya ID ara…" className="field min-w-48 flex-1 sm:max-w-sm" />
            <select aria-label="Duruma göre filtrele" className="field w-auto" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tüm durumlar</option><option value="DRAFT">Taslak</option><option value="COMPLETED">Tamamlandı</option>
            </select>
            <select aria-label="Akışa göre filtrele" className="field w-auto" value={syncFilter} onChange={(event) => setSyncFilter(event.target.value)}>
              <option value="all">Tüm akışlar</option><option value="sync">Senkron</option><option value="async">Asenkron</option>
            </select>
            <label className="flex min-h-9 items-center gap-2 px-1 text-xs text-slate-300"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} />İnceleme bekleyenler</label>
            {hasFilters && <button type="button" className="btn" onClick={clearFilters}>Temizle</button>}
            <select aria-label="Listeyi sırala" className="field ml-auto w-auto" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="updated">Son güncellenen</option><option value="name">Servis adı (A–Z)</option>
            </select>
          </section>

          <ErrorPanel error={resource.error} />
          {resource.error && <button className="btn" disabled={resource.loading} onClick={resource.reload}>Listeyi yeniden yükle</button>}
          {resource.loading && <Loading />}
          {!resource.loading && !resource.error && <section aria-label="Entegrasyon listesi" className="min-w-0 space-y-2">
            <p role="status" className="text-xs text-slate-400">{hasFilters ? `${integrationList.length} kayıttan ${filtered.length} sonuç` : `${integrationList.length} kayıt`}</p>
            <IntegrationTable key={`${query}/${statusFilter}/${syncFilter}/${reviewOnly}/${sort}`} data={filtered} filtered={hasFilters} onClearFilters={clearFilters} onSelect={(id) => openIntegration(id, 'dashboard')} />
          </section>}
        </div>
      )}
    </AppShell>
  )
}

export default App

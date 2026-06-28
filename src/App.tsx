import { useEffect, useState } from 'react'
import { IntegrationTable } from './components/dashboard/IntegrationTable'
import { CreateIntegration } from './components/dashboard/CreateIntegration'
import { fetchIntegrations } from './services/fakeBackend'
import type { IntegrationRecord } from './types/integration'

function App() {
  const [integrationList, setIntegrationList] = useState<IntegrationRecord[]>([])
  const [view, setView] = useState<'dashboard' | 'create'>('dashboard')

  useEffect(() => {
    fetchIntegrations().then(setIntegrationList)
  }, [])

  const handleCreated = (newRecord: IntegrationRecord) => {
    setIntegrationList((current) => [newRecord, ...current])
    setView('dashboard')
  }

  if (view === 'create') {
    return (
      <main className="min-h-screen bg-surface text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
          <CreateIntegration onCreated={handleCreated} onCancel={() => setView('dashboard')} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[2rem] border border-border bg-surface2 p-6 shadow-panel lg:flex-row lg:items-center lg:justify-between lg:gap-0">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Vibe Integration Catalog</p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Kurumsal Servis Entegrasyonları</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-400">
                Dağınık kaynaklardan gelen servis entegrasyonlarını merkezi bir katalogda topla. Yeni servis ekleme formu ile ara katman ve payload örnekleri kaydedilir.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setView('create')} className="rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20">
                Yeni Entegrasyon Ekle
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[1.75rem] border border-border bg-surface2 p-5 shadow-panel">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Toplam Entegrasyon</p>
              <p className="mt-4 text-4xl font-semibold text-white">{integrationList.length}</p>
              <p className="mt-2 text-sm text-slate-400">Canlı, pending veya duraklatılmış entegrasyonlar.</p>
            </article>
            <article className="rounded-[1.75rem] border border-border bg-surface2 p-5 shadow-panel">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Asenkron Akışlar</p>
              <p className="mt-4 text-4xl font-semibold text-white">{integrationList.filter((item) => item.syncType === 'async').length}</p>
              <p className="mt-2 text-sm text-slate-400">Kaynak/destination verileri olay bazlı çalışır.</p>
            </article>
            <article className="rounded-[1.75rem] border border-border bg-surface2 p-5 shadow-panel">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Otomasyon Hazırlığı</p>
              <p className="mt-4 text-4xl font-semibold text-white">%75</p>
              <p className="mt-2 text-sm text-slate-400">AI önermeleri ve mapping görselleştirme moduna hazır.</p>
            </article>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 rounded-[2rem] border border-border bg-surface2 p-6 shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Entegrasyon Kataloğu</p>
              <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">Sync</button>
              <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">Async</button>
              <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">JSON/XML/IDOC</button>
            </div>
          </div>

          <IntegrationTable data={integrationList} />
        </section>
      </div>
    </main>
  )
}

export default App

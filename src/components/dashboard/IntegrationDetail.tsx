import type { EnvironmentConfig, IntegrationRecord } from '../../types/integration'
import { Badge } from '../ui/badge'

interface IntegrationDetailProps {
  integration?: IntegrationRecord
  onOpen?: () => void
}

const statusVariant = {
  DRAFT: 'warning',
  COMPLETED: 'success',
} as const

function formatAuth(value?: string): string {
  const normalized = value?.toLowerCase().replace(/[\s._-]/g, '')
  if (normalized === 'basicauth' || normalized === 'basic') return 'Basic Auth'
  if (normalized === 'oauth20' || normalized === 'oauth2') return 'OAuth 2.0'
  if (normalized === 'apikey') return 'API Key'
  if (!value || normalized === 'none') return 'Yok'
  return value
}

function formatDuration(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms >= 60000 && ms % 60000 === 0) return `${ms / 60000} dk`
  if (ms >= 1000 && ms % 1000 === 0) return `${ms / 1000} sn`
  return `${ms} ms`
}

function envLabel(value: EnvironmentConfig['environmentType']): string { return value }

function ConfigCard({ title, configs }: { title: string; configs: EnvironmentConfig[] }) {
  if (configs.length === 0) {
    return (
      <section className="detail-config rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">Bu hedef için ortam yapılandırması yok.</p>
      </section>
    )
  }

  return (
    <section className="detail-config space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="grid gap-3">
        {configs.map((config) => (
          <article key={`${config.configTarget}-${config.environmentType}-${config.url}`} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Badge variant="muted">{envLabel(config.environmentType)}</Badge>
              <span className="text-xs text-slate-500">{formatAuth(config.authType)}</span>
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">URL</dt>
                <dd className="break-all text-slate-200">{config.url || '—'}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">Timeout</dt>
                  <dd className="text-slate-200">{formatDuration(config.timeoutMs)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Retry</dt>
                  <dd className="text-slate-200">{config.retryCount ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Aralık</dt>
                  <dd className="text-slate-200">{formatDuration(config.retryIntervalMs)}</dd>
                </div>
              </div>
              {config.credentialsConfigured && (
                <div>
                  <dt className="text-xs text-slate-500">Erişim bilgisi</dt>
                  <dd className="text-slate-200">Kayıtlı</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

export function IntegrationDetail({ integration, onOpen }: IntegrationDetailProps) {
  if (!integration) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
        <div>
          <p className="text-base font-semibold text-white">Entegrasyon ayrıntısı</p>
          <p className="mt-2 max-w-sm text-sm text-slate-400">Listeden bir kayıt seçin. Ortam, kimlik tipi ve retry bilgileri burada açılır.</p>
        </div>
      </div>
    )
  }

  const configs = integration.environmentConfigs ?? []
  const destinationConfigs = configs.filter((config) => config.configTarget === 'DESTINATION')
  const middlewareConfigs = configs.filter((config) => config.configTarget === 'MIDDLEWARE')

  return (
    <div className="integration-detail flex h-full flex-col gap-5 border p-5">
      <header className="space-y-3 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Servis</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{integration.serviceName}</h2>
          </div>
          <Badge variant={statusVariant[integration.status]}>{integration.status}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{integration.description || 'Açıklama girilmemiş.'}</p>
        <p className="text-xs text-slate-500">Son güncelleme: {integration.lastUpdated}</p>
      </header>

      {integration.reviewRequired && <p className="hint text-amber-200">Teknik değişiklik sonrası inceleme bekleniyor.</p>}
      {onOpen && <button type="button" className="btn-primary" onClick={onOpen}>Kaydı aç</button>}
      <section>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500">Akış</p>
        <div className={`detail-flow ${integration.hasMiddleware || integration.middleware ? 'has-middleware' : ''}`}>
          <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-sky-200/80">Kaynak</p>
            <p className="text-sm font-semibold text-white">{integration.sourceSystem || '—'}</p>
            <p className="text-xs text-slate-400">{integration.formatSource.toUpperCase()}</p>
          </div>
          <span className="text-slate-500">→</span>
          {integration.hasMiddleware || integration.middleware ? (
            <>
              <div className="rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-violet-200/80">Ara katman</p>
                <p className="text-sm font-semibold text-white">{integration.middleware || '—'}</p>
              </div>
              <span className="text-slate-500">→</span>
            </>
          ) : null}
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/80">Hedef</p>
            <p className="text-sm font-semibold text-white">{integration.destinationSystem || '—'}</p>
            <p className="text-xs text-slate-400">{integration.formatDestination.toUpperCase()}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <p className="text-xs text-slate-500">Mod</p>
          <p className="text-sm font-medium text-white">{integration.syncType.toUpperCase()}</p>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <p className="text-xs text-slate-500">Ara katman</p>
          <p className="text-sm font-medium text-white">{integration.hasMiddleware || integration.middleware ? 'Var' : 'Yok'}</p>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <p className="text-xs text-slate-500">Kaynak format</p>
          <p className="text-sm font-medium text-white">{integration.formatSource.toUpperCase()}</p>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <p className="text-xs text-slate-500">Hedef format</p>
          <p className="text-sm font-medium text-white">{integration.formatDestination.toUpperCase()}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ConfigCard title="Hedef ortamları" configs={destinationConfigs} />
        <ConfigCard title="Ara katman ortamları" configs={middlewareConfigs} />
      </div>
    </div>
  )
}

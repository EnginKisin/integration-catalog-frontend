import { useId, useState } from 'react'
import { useSession } from '../../auth/session'
import { configDrafts, configKey, configRequests } from '../../lib/integrationWorkflow'
import type { ConfigDraft } from '../../lib/integrationWorkflow'
import type { WorkspaceMutation } from '../../lib/integrationWorkflow'
import { canManageCredentials, canViewCredentials } from '../../services/auth'
import { saveConfigs } from '../../services/integrationsBackend'
import type { IntegrationRecord } from '../../types/integration'
import { CredentialReveal } from './CredentialReveal'
import { CredentialsEditor } from './CredentialsEditor'
import { SaveActions } from './SaveActions'
import { saveIntent } from '../../lib/form'
import './environment-editor.css'

const environments = [
  { name: 'DEV', label: 'Geliştirme', description: 'Geliştirme ve ilk denemeler', icon: 'terminal' },
  { name: 'TEST', label: 'Test', description: 'Doğrulama ve kabul testleri', icon: 'flask' },
  { name: 'PROD', label: 'Canlı', description: 'Canlı kullanım ortamı', icon: 'globe' },
] as const

const iconPaths = {
  terminal: 'm4 6 4 4-4 4m7 0h5M2 3h16v14H2z',
  flask: 'M7 2h6m-5 0v6l-5 7a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-7V2M6 12h8',
  globe: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0M2 10h16M10 2a15 15 0 0 1 0 16 15 15 0 0 1 0-16',
  server: 'M3 3h14v5H3zm0 9h14v5H3zM6 5.5h.01M6 14.5h.01M10 8v4',
  layers: 'm10 2 8 4-8 4-8-4 8-4zm-8 8 8 4 8-4m-16 4 8 4 8-4',
  link: 'm8 12 4-4m-6 3-1 1a3 3 0 0 0 4 4l3-3m-4-6 3-3a3 3 0 0 1 4 4l-1 1',
  shield: 'm10 2 7 3v5c0 4-7 8-7 8s-7-4-7-8V5l7-3zm-3 8 2 2 4-4',
  plus: 'M10 4v12M4 10h12',
  check: 'm4 10 4 4 8-8',
  trash: 'M3 5h14M8 2h4l1 3M5 5l1 13h8l1-13M8 8v7m4-7v7',
  settings: 'M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4',
  chevron: 'm7 4 6 6-6 6',
  info: 'M10 9v5m0-8h.01M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
}

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg className="environment-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>
}

export function EnvironmentEditor({ record, busy, saving, dirty, onDirty, mutate, onBack }: {
  record: IntegrationRecord
  busy: boolean
  saving: boolean
  dirty: boolean
  onDirty: () => void
  mutate: WorkspaceMutation
  onBack: () => void
}) {
  const { user } = useSession()
  const formId = useId()
  const manage = user != null && canManageCredentials(user)
  const view = user != null && canViewCredentials(user)
  const targetNames = {
    DESTINATION: record.destinationSystem?.trim() || 'Hedef sistem',
    MIDDLEWARE: record.middleware?.trim() || 'Ara katman',
  }
  const [rows, setRows] = useState(() => configDrafts(record.environmentConfigs))
  const update = (key: string, values: Partial<ConfigDraft>) => {
    setRows((current) => current.map((item) => item.key === key ? { ...item, ...values } : item))
    onDirty()
  }
  const removed = record.environmentConfigs.filter((item) => !rows.some((row) => configKey(row) === configKey(item)))
  const targets: ConfigDraft['configTarget'][] = record.hasMiddleware ? ['DESTINATION', 'MIDDLEWARE'] : ['DESTINATION']
  const environmentCount = new Set(rows.map((row) => row.environmentType)).size
  return <form className="environment-editor" onSubmit={(event) => {
    event.preventDefault()
    if (busy) return
    void mutate(() => dirty ? saveConfigs(record.id, configRequests(rows, record.environmentConfigs, record.hasMiddleware, manage)) : Promise.resolve(), 'Ortam ayarları kaydedildi.', saveIntent(event))
  }}>
    <header className="environment-heading">
      <div><p className="environment-eyebrow">BAĞLANTI YAPILANDIRMASI</p><h2>Ortam ayarları</h2><p>Sistemlerinizin bağlantı ve erişim bilgilerini ortam bazında yönetin.</p></div>
      <div className="environment-totals"><span><strong>{environmentCount}</strong> ortam</span><span><strong>{rows.length}</strong> bağlantı</span></div>
    </header>
    {!manage && <p className="environment-notice"><Icon name="shield" /><span>Erişim bilgisi değiştirme izniniz yok. Kayıtlı bilgileri koruyarak URL ve teknik ayarları düzenleyebilirsiniz; yeni ortamlar kimlik doğrulamasız eklenebilir.</span></p>}
    {removed.length > 0 && <p role="status" className="environment-notice is-warning"><Icon name="info" /><span>Kaydettiğinizde kaldırılacak bağlantılar: {removed.map((item) => `${item.environmentType} / ${targetNames[item.configTarget]}`).join(', ')}</span></p>}
    <fieldset disabled={busy} className="environment-workspace">
      <legend className="sr-only">Ortam bağlantılarını düzenle</legend>
      <div className="environment-picker">
        {environments.map(({ name, label, description, icon }) => {
          const count = rows.filter((row) => row.environmentType === name).length
          const missing = targets.filter((configTarget) => !rows.some((row) => row.environmentType === name && row.configTarget === configTarget))
          return <button key={name} type="button" className={`environment-tile ${count ? 'has-connections' : ''}`} data-environment={name} aria-label={missing.length ? `+ ${name} ekle` : `✓ ${name} eklendi`} aria-describedby={`${formId}-${name}-description`} disabled={busy || !missing.length} onClick={() => {
            setRows((current) => [...current, ...missing.map((configTarget) => ({ key: crypto.randomUUID(), environmentType: name, configTarget, authType: 'NONE' as const, url: '', timeoutMs: '60000', retryCount: '0', retryIntervalMs: '0', credentialsText: '' }))]); onDirty()
          }}>
            <span className="environment-tile-top"><span className="environment-tile-icon"><Icon name={icon} /></span><span className="environment-tile-title"><strong>{name}</strong><span>{label}</span></span><span className="environment-tile-action"><Icon name={missing.length ? 'plus' : 'check'} /></span></span>
            <span id={`${formId}-${name}-description`} className="environment-tile-description">{description}</span>
            <span className="environment-tile-bottom"><span>{count ? `${count} bağlantı eklendi` : 'Henüz eklenmedi'}</span><span>{missing.length ? 'Ortam ekle' : 'Eklendi'}</span></span>
          </button>
        })}
      </div>
      <p className="environment-picker-hint"><Icon name="info" />En az bir ortam eklemeniz yeterli. Her ortam için {record.hasMiddleware ? `${targetNames.DESTINATION} ve ${targetNames.MIDDLEWARE}` : targetNames.DESTINATION} bağlantısını tanımlayın.</p>
      {!rows.length && <div className="environment-empty">
        <div className="environment-empty-symbol"><Icon name="server" /><span /><Icon name="link" /><span /><Icon name="globe" /></div>
        <h3>İlk ortamınızı ekleyin</h3><p>Yukarıdan bir ortam seçin, ardından sisteminizin<br className="hidden sm:block" /> bağlantı adresini ve erişim bilgilerini tanımlayın.</p>
        <span className="environment-empty-caption">DEV ile başlayıp diğer ortamları daha sonra ekleyebilirsiniz.</span>
      </div>}
      <div className="environment-groups">
        {environments.map(({ name, label }) => {
          const environmentRows = rows.filter((row) => row.environmentType === name)
          if (!environmentRows.length) return null
          return <section key={name} className="environment-group" data-environment={name} aria-labelledby={`${formId}-${name}-heading`}>
            <header className="environment-group-heading"><h3 id={`${formId}-${name}-heading`}><span className="environment-dot" />{name}<span>{label} ortamı</span></h3><span>{environmentRows.length} bağlantı</span></header>
            {environmentRows.map((row) => {
              const original = record.environmentConfigs.find((item) => configKey(item) === row.key)
              const hasCredentials = original?.credentialsConfigured ?? false
              return <fieldset key={row.key} className={`environment-connection ${row.configTarget === 'MIDDLEWARE' ? 'is-middleware' : ''}`}>
                <legend className="sr-only">{row.environmentType} / {targetNames[row.configTarget]}</legend>
                <header className="environment-connection-heading">
                  <span className="environment-system-icon"><Icon name={row.configTarget === 'MIDDLEWARE' ? 'layers' : 'server'} /></span>
                  <div className="environment-system-name"><span>{row.configTarget === 'MIDDLEWARE' ? 'ARA KATMAN' : 'HEDEF SİSTEM'}</span><h4>{targetNames[row.configTarget]}</h4></div>
                  <span className={`environment-record-state ${original ? 'is-saved' : ''}`}><Icon name={original ? 'check' : 'plus'} />{original ? 'Kayıtlı bağlantı' : 'Yeni bağlantı'}</span>
                  <button type="button" className="environment-remove" disabled={!manage && hasCredentials} onClick={() => { setRows((current) => current.filter((item) => item.key !== row.key)); onDirty() }}><Icon name="trash" /><span>Satırı kaldır</span></button>
                </header>
                <div className="environment-connection-body">
                  <div className="environment-address">
                    <h5 className="environment-section-title"><Icon name="link" />Bağlantı bilgileri</h5>
                    <div className="environment-identity-fields">
                      <label className="label">Ortam<select className="field" disabled={!!original} value={row.environmentType} onChange={(event) => update(row.key, { environmentType: event.target.value as ConfigDraft['environmentType'] })}>{environments.map(({ name }) => <option key={name}>{name}</option>)}</select></label>
                      <label className="label">Hedef<select className="field" disabled={!!original} value={row.configTarget} onChange={(event) => update(row.key, { configTarget: event.target.value as ConfigDraft['configTarget'] })}><option value="DESTINATION">{targetNames.DESTINATION}</option>{(record.hasMiddleware || row.configTarget === 'MIDDLEWARE') && <option value="MIDDLEWARE">{targetNames.MIDDLEWARE}</option>}</select></label>
                    </div>
                    <label className="label environment-url-label">URL (en fazla 100 karakter)<input className="field environment-url" required maxLength={100} placeholder="https://api.example.com/v1" spellCheck={false} value={row.url} onChange={(event) => update(row.key, { url: event.target.value })} /></label>
                    {original && <p className="environment-field-note">Ortam veya sistemi değiştirmek için yeni bir bağlantı ekleyin.</p>}
                  </div>
                  <div className="environment-security">
                    <h5 className="environment-section-title"><Icon name="shield" />Kimlik ve erişim{hasCredentials && <span className="environment-credential-badge">Bilgiler kayıtlı</span>}</h5>
                    <label className="label">Kimlik doğrulama<select className="field" disabled={!manage} value={row.authType} onChange={(event) => update(row.key, { authType: event.target.value as ConfigDraft['authType'], credentialsText: '' })}>{Object.entries({ NONE: 'Yok', BASIC_AUTH: 'Kullanıcı adı ve parola', OAUTH2: 'OAuth 2.0', API_KEY: 'API anahtarı' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    {row.authType === 'NONE' && !hasCredentials && <p className="environment-auth-note"><Icon name="shield" /><span>Bu bağlantı için erişim bilgisi gönderilmez.<small>Sisteminiz gerektiriyorsa bir doğrulama yöntemi seçin.</small></span></p>}
                    {row.authType === 'NONE' && hasCredentials && <p className="environment-notice is-warning">Kaydettiğinizde mevcut erişim bilgileri temizlenecek.</p>}
                    {manage && row.authType !== 'NONE' && <div className="environment-credentials"><CredentialsEditor key={row.authType} type={row.authType} value={row.credentialsText} preserve={hasCredentials && original?.authType === row.authType} onChange={(value) => update(row.key, { credentialsText: value })} /></div>}
                    {original && hasCredentials && view && <div className="environment-reveal"><CredentialReveal id={record.id} config={original} /></div>}
                  </div>
                </div>
                {!record.hasMiddleware && row.configTarget === 'MIDDLEWARE' && <p className="environment-notice is-warning environment-legacy-notice"><Icon name="info" /><span>Önceki akıştan kalan ara katman ayarı. Yeni doğrudan akış için kaldırılması gerekir.</span></p>}
                <details className="environment-advanced"><summary><Icon name="settings" /><span>Gelişmiş bağlantı ayarları</span><span className="environment-advanced-preview">{row.timeoutMs || '—'} ms · {row.retryCount || '0'} tekrar</span><Icon name="chevron" /></summary><div className="environment-advanced-fields">{(['timeoutMs', 'retryCount', 'retryIntervalMs'] as const).map((field) => <label className="label" key={field}>{field === 'timeoutMs' ? 'Zaman aşımı (ms)' : field === 'retryCount' ? 'Yeniden deneme sayısı' : 'Deneme aralığı (ms)'}<input className="field" type="number" step={1} min={field === 'timeoutMs' ? 1 : 0} value={row[field]} onChange={(event) => update(row.key, { [field]: event.target.value })} /></label>)}</div></details>
              </fieldset>
            })}
          </section>
        })}
      </div>
      <footer className="environment-footer"><p><Icon name="info" /><span>Bilgiler katalogda saklanır. Bağlantı testi yapılmaz.</span><span className={`environment-save-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? 'Kaydedilmemiş değişiklikler' : 'Değişiklikler kaydedildi'}</span></p><SaveActions busy={busy} saving={saving} onBack={onBack} /></footer>
    </fieldset>
  </form>
}

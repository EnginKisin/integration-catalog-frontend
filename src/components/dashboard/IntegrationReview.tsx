import { Fragment } from 'react'
import type { IntegrationStep, IntegrationStepId } from '../../lib/integrationWorkflow'
import type { AuthType, IntegrationWorkspaceData } from '../../types/integration'
import { MappingReview } from './MappingEditor'
import { SchemaSample } from './SchemaSample'
import './integration-review.css'

interface Props extends IntegrationWorkspaceData {
  steps: IntegrationStep[]
  issues: string[]
  editable: boolean
  busy: boolean
  blocked: boolean
  dirty: boolean
  reviewed: boolean
  onReviewedChange: (reviewed: boolean) => void
  onStep: (step: IntegrationStepId) => void
  onPrevious: () => void
  onClose: () => void
  onConfirmReview: () => void
  onComplete: () => void
}

const authLabels: Record<AuthType, string> = { NONE: 'Kimlik doğrulama yok', BASIC_AUTH: 'Basic Auth', OAUTH2: 'OAuth 2.0', API_KEY: 'API Key' }

export function IntegrationReview({ record, schemas, mappings, steps, issues, editable, busy, blocked, dirty, reviewed, onReviewedChange, onStep, onPrevious, onClose, onConfirmReview, onComplete }: Props) {
  const completed = record.status === 'COMPLETED'
  const needsAttention = issues.length > 0
  const showMappings = steps.some((step) => step.id === 'mappings')
  const environmentCount = new Set(record.environmentConfigs.map((config) => config.environmentType)).size
  const systems = [
    { role: 'KAYNAK SİSTEM', name: record.sourceSystem || 'Kaynak', detail: record.formatSource.toUpperCase(), mark: '↗', middleware: false },
    ...(record.hasMiddleware ? [{ role: 'ARA KATMAN', name: record.middleware || 'Ara katman', detail: 'Alan dönüşümü', mark: '{ }', middleware: true }] : []),
    { role: 'HEDEF SİSTEM', name: record.destinationSystem || 'Hedef', detail: record.formatDestination.toUpperCase(), mark: '↙', middleware: false },
  ]
  const schemaStep = steps.find((step) => step.id === 'schemas')
  const checks = steps.filter((step) => step.id !== 'basics' && step.id !== 'review')
  const schemaGroups = [
    { label: 'İstek örnekleri', schemas: schemas.filter((schema) => schema.schemaType.endsWith('REQUEST')) },
    { label: 'Yanıt örnekleri', schemas: schemas.filter((schema) => schema.schemaType.endsWith('RESPONSE')) },
  ].filter((group) => group.schemas.length)

  return <div className="integration-review">
    <div className="review-page-heading"><div><p className="review-eyebrow">SON KONTROL</p><h2>Özet ve tamamlama</h2><p>Kaydettiğiniz yapılandırmayı inceleyin, ardından katalog kaydını tamamlayın.</p></div><span className={`review-status-pill ${needsAttention ? 'needs-attention' : completed ? 'is-completed' : ''}`}><span />{needsAttention ? 'Kontrol gerekiyor' : completed ? 'Tamamlandı' : 'Tamamlamaya hazır'}</span></div>

    <div className="review-overview-grid">
      <section className="review-panel review-overview" aria-label="Entegrasyon özeti">
        <header className="review-section-heading"><div><p className="review-eyebrow">KAYITLI YAPILANDIRMA</p><h3>Entegrasyon akışı</h3></div><span className="review-sync-badge">{record.syncType === 'sync' ? '↔ Senkron' : '→ Asenkron'}</span></header>
        <div className={`review-system-flow ${record.hasMiddleware ? 'has-middleware' : ''}`}>
          {systems.map((system, index) => <Fragment key={system.role}>{index > 0 && <span className="review-flow-arrow" aria-hidden="true">→</span>}<div className={`review-system ${system.middleware ? 'is-middleware' : ''}`}><span className="review-system-mark" aria-hidden="true">{system.mark}</span><span className="review-system-role">{system.role}</span><strong>{system.name}</strong><span className="review-system-detail">{system.detail}</span></div></Fragment>)}
        </div>
        <dl className="review-metrics"><div><dt>Ortam</dt><dd>{environmentCount}<span>yapılandırılmış</span></dd></div><div><dt>İstek / yanıt</dt><dd>{schemas.length}<span>örnek kayıtlı</span></dd></div>{showMappings && <div><dt>Alan eşlemesi</dt><dd>{mappings.length}<span>bağlantı kayıtlı</span></dd></div>}</dl>
        <div className="review-description"><span>AÇIKLAMA</span><p>{record.description || 'Bu entegrasyon için açıklama eklenmemiş.'}</p></div>
        <footer className="review-section-footer"><span>Entegrasyon #{record.id} · {record.hasMiddleware ? 'Ara katmanlı akış' : 'Doğrudan akış'}</span><button type="button" disabled={busy} onClick={() => onStep('basics')}>Temel bilgileri aç <span aria-hidden="true">↗</span></button></footer>
      </section>

      <section className={`review-panel review-check-panel ${needsAttention ? 'needs-attention' : ''}`} aria-label="Tamamlama kontrolü">
        <header className="review-section-heading"><div><p className="review-eyebrow">KATALOG DURUMU</p><h3>Tamamlama kontrolü</h3></div><span className="review-check-mark" aria-hidden="true">{needsAttention ? '!' : '✓'}</span></header>
        <ol className="review-check-list">{checks.map((step) => <li key={step.id}><span className={step.issues.length ? 'review-check-warning' : 'review-check-ok'} aria-hidden="true">{step.issues.length ? '!' : '✓'}</span><div><strong>{step.label}</strong><span>{step.issues.length ? `${step.issues.length} eksik / kontrol` : step.detail}</span></div></li>)}<li><span className={record.reviewRequired ? 'review-check-warning' : 'review-check-ok'} aria-hidden="true">{record.reviewRequired ? '!' : '✓'}</span><div><strong>Teknik inceleme</strong><span>{record.reviewRequired ? 'İnceleme onayı bekleniyor' : 'Bekleyen inceleme yok'}</span></div></li></ol>
        {!needsAttention && <p className="review-ready-message">{completed ? 'Katalog kaydı tamamlandı.' : 'Gerekli bilgiler kayıtlı. Katalog kaydını tamamlayabilirsiniz.'}</p>}
        <p className="review-completion-note">Tamamlama, entegrasyonun katalog bilgilerinin hazır olduğunu gösterir. Entegrasyonu çalıştırmaz.</p>
      </section>
    </div>

    {needsAttention && <section className="review-attention-panel" aria-label="Tamamlanması gereken kontroller"><header><span aria-hidden="true">!</span><div><h3>Tamamlamadan önce gözden geçirin</h3><p>{issues.length} eksik veya kontrol bekleyen konu var.</p></div></header><div className="review-issue-grid">{steps.filter((step) => step.issues.length).map((step) => <div key={step.id} className="review-issue"><div><h4>{step.label}</h4>{step.id !== 'review' && <button type="button" disabled={busy} onClick={() => onStep(step.id)}>İlgili adıma git <span aria-hidden="true">↗</span></button>}</div><ul>{step.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>)}</div></section>}

    <section className="review-panel" aria-label="Kayıtlı ortam ayarları">
      <header className="review-section-heading"><div><p className="review-eyebrow">BAĞLANTI YAPILANDIRMASI</p><h3>Ortam ayarları</h3></div><span className="review-count">{environmentCount} ortam · {record.environmentConfigs.length} bağlantı</span></header>
      {record.environmentConfigs.length ? <div className="review-table-scroll" tabIndex={0} role="region" aria-label="Ortam ayarları tablosu"><table><thead><tr><th scope="col">ORTAM</th><th scope="col">SİSTEM</th><th scope="col">ADRES</th><th scope="col">KİMLİK DOĞRULAMA</th><th scope="col">ERİŞİM BİLGİSİ</th></tr></thead><tbody>{record.environmentConfigs.map((config) => <tr key={`${config.environmentType}/${config.configTarget}`}><td><span className={`review-environment environment-${config.environmentType.toLowerCase()}`}>{config.environmentType}</span></td><td><strong>{config.configTarget === 'MIDDLEWARE' ? record.middleware || 'Ara katman' : record.destinationSystem || 'Hedef'}</strong><span className="review-cell-caption">{config.configTarget === 'MIDDLEWARE' ? 'Ara katman' : 'Hedef sistem'}</span></td><td><code>{config.url}</code>{(config.timeoutMs != null || config.retryCount != null) && <span className="review-cell-caption">{config.timeoutMs != null ? `${config.timeoutMs} ms zaman aşımı` : ''}{config.timeoutMs != null && config.retryCount != null ? ' · ' : ''}{config.retryCount != null ? `${config.retryCount} yeniden deneme` : ''}</span>}</td><td>{authLabels[config.authType]}</td><td><span className={config.authType === 'NONE' || config.credentialsConfigured ? 'review-credential-state' : 'review-credential-state is-missing'}>{config.authType === 'NONE' ? 'Gerekmiyor' : config.credentialsConfigured ? '● Kayıtlı' : '◐ Eksik'}</span></td></tr>)}</tbody></table></div> : <p className="review-empty-state">Henüz ortam kaydedilmedi.</p>}
      <footer className="review-section-footer"><span>Adresler ve kimlik doğrulama ayarları kayıtlı hâliyle gösterilir.</span><button type="button" disabled={busy} onClick={() => onStep('configs')}>Ortam ayarlarını aç <span aria-hidden="true">↗</span></button></footer>
    </section>

    <section className="review-panel" aria-label="Kayıtlı istek ve yanıt örnekleri">
      <header className="review-section-heading"><div><p className="review-eyebrow">MESAJ YAPILARI</p><h3>İstek ve yanıt örnekleri</h3></div><span className="review-count">{schemaStep?.detail ?? `${schemas.length} örnek`}</span></header>
      {schemaGroups.length ? <div className="review-payload-groups">{schemaGroups.map((group) => <div className="review-payload-group" key={group.label}><div className="review-payload-group-heading"><span>{group.label}</span><span>{group.schemas.length}</span></div>{group.schemas.map((schema) => <div className="review-sample" key={schema.id}><SchemaSample record={record} schema={schema} disabled={busy} /></div>)}</div>)}</div> : <p className="review-empty-state">Henüz istek veya yanıt örneği kaydedilmedi.</p>}
      <footer className="review-section-footer"><span>Örnekleri açarak içeriklerini inceleyebilirsiniz.</span><button type="button" disabled={busy} onClick={() => onStep('schemas')}>İstek ve yanıt adımını aç <span aria-hidden="true">↗</span></button></footer>
    </section>

    {showMappings && <section className="review-panel review-mappings" aria-label="Kaydedilmiş alan eşlemeleri">{mappings.length ? <MappingReview record={record} schemas={schemas} mappings={mappings} busy={blocked} /> : <><header className="review-section-heading"><div><p className="review-eyebrow">KAYITLI EŞLEMELER</p><h3>Alan eşlemeleri</h3></div><span className="review-count">İsteğe bağlı</span></header><p className="review-empty-state">Alan eşlemesi yok. Eşleme eklemeden tamamlayabilirsiniz.</p></>}</section>}

    {editable && record.reviewRequired && <section className="review-attention-panel review-confirmation" aria-label="Teknik inceleme onayı"><div><p className="review-eyebrow">İNCELEME ONAYI</p><h3>Teknik değişiklikleri kontrol ettiniz mi?</h3><p>Onay, inceleme işaretini kaldırır. Katalog kaydını ardından ayrıca tamamlayabilirsiniz.</p></div><label><input type="checkbox" disabled={blocked || dirty} checked={reviewed} onChange={(event) => onReviewedChange(event.target.checked)} /><span>Ortamları, erişim bilgisi yapılandırmasını, istek/yanıt örneklerini ve mevcut alan eşlemelerini yeni akışa göre gözden geçirdim.</span></label><button type="button" className="btn" disabled={blocked || dirty || !reviewed} onClick={onConfirmReview}>İncelemeyi onayla</button></section>}

    <footer aria-label="İnceleme işlemleri" className="review-actions"><button type="button" className="btn" disabled={busy} onClick={onPrevious}>← Önceki adım</button><span className="review-footer-state"><span className={needsAttention ? 'needs-attention' : ''} />{needsAttention ? 'Bekleyen kontroller var' : completed ? 'Kayıt tamamlandı' : 'Tamamlamaya hazır'}</span>{editable && <button type="button" className="btn-primary sm:ml-auto" disabled={blocked || dirty || needsAttention || completed} onClick={onComplete}>{completed ? 'Katalog kaydı tamamlandı' : busy ? 'Kaydediliyor…' : 'Katalog kaydını tamamla'}</button>}<button type="button" className="btn" disabled={busy} onClick={onClose}>Kaydı kapat</button></footer>
  </div>
}

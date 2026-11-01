import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../../auth/session'
import { useResource, useTask } from '../../hooks/useRequest'
import { completionIssues, integrationSteps, resumeStep } from '../../lib/integrationWorkflow'
import type { IntegrationStepId, WorkspaceMutation } from '../../lib/integrationWorkflow'
import { ApiError } from '../../services/api'
import { canEdit, canViewCredentials, isAdmin } from '../../services/auth'
import { completeIntegration, confirmReview, deleteIntegration, fetchIntegrationWorkspace, updateIntegration } from '../../services/integrationsBackend'
import type { IntegrationWorkspaceData } from '../../types/integration'
import { ErrorPanel, Loading, TaskFeedback } from '../ui/feedback'
import { CredentialReveal } from './CredentialReveal'
import { EnvironmentEditor } from './EnvironmentEditor'
import { IntegrationBasicsForm } from './IntegrationBasicsForm'
import { IntegrationDetail } from './IntegrationDetail'
import { SchemaEditor } from './SchemaEditor'
import { SchemaSample } from './SchemaSample'
import { MappingEditor } from './MappingEditor'
import { IntegrationActions } from './IntegrationActions'
import { IntegrationStepper } from './IntegrationStepper'
import { IntegrationReview } from './IntegrationReview'
import { AppIcon } from '../ui/AppIcon'
import { Badge } from '../ui/badge'

interface Props {
  id: string
  onBack: () => void
  backLabel?: string
  onChanged: () => void
  onDeleted: () => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
  onSavedExit: () => void
  newlyCreated?: boolean
}

export function IntegrationWorkspace(props: Props) {
  const load = useCallback(() => fetchIntegrationWorkspace(props.id), [props.id])
  const resource = useResource(load)
  if (resource.loading) return <Loading />
  if (resource.error || !resource.data) return <div className="space-y-4"><ErrorPanel error={resource.error} /><button className="btn" onClick={resource.reload}>Kaydı yeniden oku</button><button className="btn" onClick={props.onBack}>{props.backLabel ?? 'Listeye dön'}</button></div>
  return <WorkspaceContent {...props} initial={resource.data} />
}
function WorkspaceContent({ initial, ...props }: Props & { initial: IntegrationWorkspaceData }) {
  const { user } = useSession()
  const [data, setData] = useState(initial)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<IntegrationStepId>(() => props.newlyCreated ? 'configs' : resumeStep(initial.record, initial.schemas, initial.mappings))
  const [dirty, setDirty] = useState(false)
  const [stale, setStale] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [advanceBlocked, setAdvanceBlocked] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const task = useTask()
  const editable = user != null && canEdit(user)
  const admin = user != null && isAdmin(user)
  const showCredentials = user != null && canViewCredentials(user)
  const blocked = task.busy || stale
  const record = data.record
  const issues = completionIssues(record, data.schemas, data.mappings)
  const steps = integrationSteps(record, data.schemas, data.mappings)
  const stepIndex = steps.findIndex((step) => step.id === tab)
  const currentStep = steps[stepIndex]
  const markDirty = () => { setDirty(true); setAdvanceBlocked(false); props.onDirtyChange(true) }
  const clearDirty = () => { setDirty(false); props.onDirtyChange(false) }
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { headingRef.current?.focus() }, [tab])
  const goTo = (next: IntegrationStepId) => {
    if (task.busy || next === tab) return
    if (dirty && !window.confirm('Bu adımdaki değişiklikler kaydedilmedi. Kaydetmeden geçmek istiyor musunuz?')) return
    clearDirty(); setTab(next); setReviewed(false); setAdvanceBlocked(false)
  }
  const previous = () => { if (stepIndex > 0) goTo(steps[stepIndex - 1].id) }
  const apply = (fresh: IntegrationWorkspaceData) => {
    setData(fresh); setRevision((value) => value + 1); clearDirty(); setStale(false); setReviewed(false)
    if (tab === 'mappings' && !integrationSteps(fresh.record, fresh.schemas, fresh.mappings).some((step) => step.id === 'mappings')) setTab('schemas')
  }
  const mutate: WorkspaceMutation = async (action, success, intent = 'stay', options) => {
    if (blocked || !editable) return false
    let fresh: IntegrationWorkspaceData | undefined
    const saved = await task.run(async () => {
      props.onBusyChange(true)
      try {
        try { await action() }
        catch (error) {
          if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) setStale(true)
          else if (options?.refreshOnError) {
            // A multi-slot save may have committed earlier slots. Keep failed drafts mounted.
            try { setData(await fetchIntegrationWorkspace(record.id)); setReviewed(false) }
            catch { setStale(true) }
          }
          throw error
        } finally { props.onChanged() }
        try {
          fresh = await fetchIntegrationWorkspace(record.id)
          if (options?.preserveDraft) { setData(fresh); setStale(false); setReviewed(false); if (!options.preserveDirty) clearDirty() }
          else apply(fresh)
        }
        catch {
          setStale(true)
          throw new Error('Bilgiler kaydedildi fakat güncel kayıt okunamadı. Devam etmek için “Sunucudaki kaydı yeniden oku” düğmesini kullanın.')
        }
      } finally { props.onBusyChange(false) }
    }, success)
    if (saved && fresh) {
      setAdvanceBlocked(false)
      if (intent === 'exit') props.onSavedExit()
      else if (intent === 'next') {
        const updatedSteps = integrationSteps(fresh.record, fresh.schemas, fresh.mappings)
        const index = updatedSteps.findIndex((step) => step.id === tab)
        if (updatedSteps[index]?.issues.length) setAdvanceBlocked(true)
        else setTab(updatedSteps[index + 1]?.id ?? 'review')
      }
    }
    return saved
  }
  const refresh = () => {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler sunucudaki kayıtla değiştirilecek. Devam edilsin mi?')) return
    void task.run(async () => {
      props.onBusyChange(true)
      try { apply(await fetchIntegrationWorkspace(record.id)); props.onChanged() }
      finally { props.onBusyChange(false) }
    }, 'Güncel kayıt sunucudan okundu.')
  }
  return <div className={`integration-flow app-page mx-auto w-full ${(tab === 'mappings' || tab === 'review') ? 'max-w-[1600px]' : 'max-w-6xl'}`}>
    <header className="page-heading workflow-heading">
      <div className="page-heading-copy"><p className="page-eyebrow">ENTEGRASYON #{record.id}</p><h1>{record.serviceName}</h1><div className="workflow-meta"><Badge variant={record.status === 'COMPLETED' ? 'success' : 'warning'}>{record.status === 'COMPLETED' ? 'Tamamlandı' : 'Taslak'}</Badge><span>{record.syncType === 'sync' ? 'Senkron' : 'Asenkron'}</span><span>·</span><span>{record.hasMiddleware ? 'Ara katmanlı' : 'Doğrudan'}</span><span>·</span><span>Son güncelleme: {record.lastUpdated}</span></div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={task.busy} onClick={refresh}><AppIcon name="refresh" />{stale ? 'Sunucudaki kaydı yeniden oku' : 'Yenile'}</button>
        <button type="button" className="btn" disabled={task.busy} onClick={props.onBack}><AppIcon name="back" />{props.backLabel ?? 'Listeye dön'}</button>
        {admin && <IntegrationActions name={record.serviceName} disabled={blocked || dirty} busy={task.busy} error={task.error} onDelete={() => {
          if (!admin || blocked || dirty) return Promise.resolve(false)
          return task.run(async () => {
            props.onBusyChange(true)
            try { await deleteIntegration(record.id); props.onChanged(); props.onDeleted() }
            catch (error) { if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) setStale(true); throw error }
            finally { props.onBusyChange(false) }
          })
        }} />}
      </div>
    </header>
    {props.newlyCreated && record.environmentConfigs.length === 0 && tab === 'configs' && !task.message && <p role="status" className="success-panel">Taslak oluşturuldu. Şimdi ilk ortamınızı ekleyin; isterseniz kaydedip daha sonra devam edebilirsiniz.</p>}
    <TaskFeedback task={task} />
    {stale && <p role="alert" className="error-panel">Son işlemin güncel sonucu doğrulanamadı. Kaydetme, inceleme ve tamamlama kapalı; devam etmek için kaydı yeniden okuyun.</p>}
    <p role="status" className={`text-xs ${dirty ? 'text-amber-200' : 'text-slate-400'}`}>{dirty ? 'Bu adımda kaydedilmemiş değişiklikler var.' : 'Gösterilen kayıtlı bilgiler güncel. İstediğiniz adıma dönüp düzenleyebilirsiniz.'}</p>
    {record.reviewRequired && <p className="text-sm text-amber-200">Teknik değişiklik sonrası ortamlar, istek/yanıt örnekleri ve mevcut alan eşlemeleri için inceleme gerekiyor.</p>}
    <IntegrationStepper steps={steps} current={tab} busy={task.busy} dirty={dirty} completed={record.status === 'COMPLETED'} onSelect={goTo} />
    <h2 ref={headingRef} tabIndex={-1} className="sr-only">{currentStep?.label}</h2>
    {tab !== 'review' && currentStep?.issues.length > 0 && <div role={advanceBlocked ? 'alert' : 'status'} className="workflow-notice rounded-lg border p-4 text-xs text-amber-100">
      <p className="font-medium">{advanceBlocked ? 'Bilgiler kaydedildi. Devam etmek için bu eksikleri tamamlayın.' : 'Bu adımı tamamlamak için'}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{currentStep.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      {dirty && <p className="hint mt-2">Bu liste kayıtlı bilgilere göre gösterilir; kaydettiğinizde güncellenir.</p>}
    </div>}
    <div key={`${revision}/${tab}`}>
      {tab === 'basics' && (editable ? <IntegrationBasicsForm initial={record} busy={blocked} saving={task.busy} error={task.error} onBusyChange={props.onBusyChange} onDirty={markDirty} onSave={(input, intent) => mutate(() => dirty ? updateIntegration(record.id, input) : Promise.resolve(), 'Temel bilgiler kaydedildi.', intent)} /> : <IntegrationDetail integration={record} />)}
      {tab === 'configs' && (editable ? <EnvironmentEditor record={record} busy={blocked} saving={task.busy} dirty={dirty} onDirty={markDirty} mutate={mutate} onBack={previous} /> : <div className="space-y-4"><IntegrationDetail integration={record} />{showCredentials && record.environmentConfigs.filter((item) => item.credentialsConfigured).map((config) => <section key={`${config.environmentType}/${config.configTarget}`} className="panel space-y-3"><h2 className="font-semibold">{config.environmentType} / {config.configTarget === 'MIDDLEWARE' ? record.middleware || 'Ara katman' : record.destinationSystem || 'Hedef sistem'}</h2><CredentialReveal id={record.id} config={config} /></section>)}</div>)}
      {tab === 'schemas' && (editable ? <SchemaEditor record={record} schemas={data.schemas} busy={blocked} saving={task.busy} onDirty={markDirty} mutate={mutate} onBack={previous} /> : <section className="panel space-y-3"><h2 className="font-semibold">İstek ve yanıt örnekleri</h2>{!data.schemas.length && <p className="hint">Örnek yok.</p>}{data.schemas.map((schema) => <SchemaSample key={schema.id} record={record} schema={schema} disabled={task.busy} />)}</section>)}
      {tab === 'mappings' && <MappingEditor record={record} schemas={data.schemas} mappings={data.mappings} busy={blocked} saving={task.busy} dirty={dirty} readOnly={!editable} onDirty={markDirty} mutate={mutate} onBack={previous} />}
      {tab === 'review' && <IntegrationReview record={record} schemas={data.schemas} mappings={data.mappings} steps={steps} issues={issues} editable={editable} busy={task.busy} blocked={blocked} dirty={dirty} reviewed={reviewed} onReviewedChange={setReviewed} onStep={goTo} onPrevious={previous} onClose={props.onBack} onConfirmReview={() => void mutate(() => confirmReview(record.id), 'İnceleme onaylandı. Tamamlama ayrı bir işlemdir.')} onComplete={() => void mutate(() => completeIntegration(record.id), 'Katalog kaydı tamamlandı.')} />}
    </div>
  </div>
}

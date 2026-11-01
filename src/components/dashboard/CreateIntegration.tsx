import { useEffect, useState } from 'react'
import { useTask } from '../../hooks/useRequest'
import { ApiError } from '../../services/api'
import { createIntegration } from '../../services/integrationsBackend'
import type { IntegrationRecord } from '../../types/integration'
import { TaskFeedback } from '../ui/feedback'
import { IntegrationBasicsForm } from './IntegrationBasicsForm'
import { IntegrationStepper } from './IntegrationStepper'
import type { IntegrationStep, SaveIntent } from '../../lib/integrationWorkflow'
import { AppIcon } from '../ui/AppIcon'
import { PageHeader } from '../ui/PageLayout'

const creationSteps: IntegrationStep[] = [
  { id: 'basics', label: 'Temel bilgiler', detail: 'Sistemleri ve akışı seçin', issues: ['Henüz kaydedilmedi'] },
  { id: 'configs', label: 'Ortam ayarları', detail: 'URL ve erişim bilgileri', issues: ['Henüz kaydedilmedi'] },
  { id: 'schemas', label: 'İstek ve yanıt', detail: 'Veri yapılarını tanımlayın', issues: ['Henüz kaydedilmedi'] },
  { id: 'review', label: 'Özet ve tamamlama', detail: 'Kontrol edip tamamlayın', issues: [] },
]

export function CreateIntegration({ onCreated, onCancel, onDirtyChange, onBusyChange }: {
  onCreated: (record: IntegrationRecord, intent: SaveIntent) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}) {
  const task = useTask()
  const [dirty, setDirty] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return <div className="integration-flow app-page mx-auto w-full max-w-6xl">
    <PageHeader eyebrow="YENİ BAĞLANTI" title="Yeni entegrasyon" description="Temel bilgilerle başlayın. Her adımda kaydedip daha sonra devam edebilirsiniz." actions={<button type="button" className="btn" disabled={task.busy} onClick={onCancel}><AppIcon name="back" />Listeye dön</button>} />
    <IntegrationStepper steps={creationSteps} current="basics" busy={task.busy} dirty={dirty} />
    <TaskFeedback task={task} />
    {uncertain && <p role="alert" className="error-panel">Taslak oluşturma işleminin sonucu belirsiz. Aynı kaydı tekrar oluşturmadan önce listeye dönüp kontrol edin.</p>}
    <IntegrationBasicsForm busy={task.busy || uncertain} saving={task.busy} error={task.error} onBusyChange={onBusyChange} onDirty={() => { setDirty(true); onDirtyChange(true) }} onSave={(input, intent) => task.run(async () => {
      onBusyChange(true)
      try {
        const record = await createIntegration(input)
        onDirtyChange(false)
        onCreated(record, intent)
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) setUncertain(true)
        throw error
      } finally { onBusyChange(false) }
    })} />
  </div>
}

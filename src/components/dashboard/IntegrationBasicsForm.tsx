import { FormField } from '../ui/FormField'
import { useCallback, useState } from 'react'
import { useSession } from '../../auth/session'
import { useResource } from '../../hooks/useRequest'
import { canEdit } from '../../services/auth'
import { systemLabel, selectableSystems } from '../../lib/catalog'
import type { SaveIntent } from '../../lib/integrationWorkflow'
import { fetchSelectableSystems } from '../../services/systemsBackend'
import type { SystemDefinition } from '../../types/system'
import type { IntegrationDraftInput, IntegrationRecord, PayloadFormat } from '../../types/integration'
import { payloadFormats } from '../../types/integration'
import { ErrorPanel, Loading } from '../ui/feedback'
import { InlineSystemDialog } from './InlineSystemDialog'
import { SaveActions } from './SaveActions'
import { saveIntent } from '../../lib/form'
import { AppIcon } from '../ui/AppIcon'
import { SectionHeader } from '../ui/PageLayout'

type SystemRole = 'source' | 'destination' | 'middleware'

export function IntegrationBasicsForm({ initial, busy, saving, error, onSave, onDirty, onBusyChange }: {
  initial?: IntegrationRecord
  busy: boolean
  saving: boolean
  error?: Error
  onSave: (input: IntegrationDraftInput, intent: SaveIntent) => Promise<boolean>
  onDirty?: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { user } = useSession()
  const load = useCallback(() => fetchSelectableSystems([initial?.sourceSystemId, initial?.destinationSystemId, initial?.middlewareSystemId]), [initial])
  const catalog = useResource(load)
  const [name, setName] = useState(initial?.serviceName ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [sourceSystemId, setSourceId] = useState(String(initial?.sourceSystemId ?? ''))
  const [destinationSystemId, setDestinationId] = useState(String(initial?.destinationSystemId ?? ''))
  const [middlewareSystemId, setMiddlewareId] = useState(String(initial?.middlewareSystemId ?? ''))
  const [hasMiddleware, setHasMiddleware] = useState(initial?.hasMiddleware ?? false)
  const [syncType, setSyncType] = useState(initial?.syncType ?? 'async')
  const [formatSource, setFormatSource] = useState<PayloadFormat>(initial?.formatSource ?? 'json')
  const [formatDestination, setFormatDestination] = useState<PayloadFormat>(initial?.formatDestination ?? 'json')
  const [adding, setAdding] = useState<SystemRole>()
  const [systemBusy, setSystemBusy] = useState(false)
  const [added, setAdded] = useState<SystemDefinition[]>([])
  const systems = [...(catalog.data ?? []), ...added.filter((item) => !catalog.data?.some((existing) => existing.id === item.id))]
  const sources = selectableSystems(systems, initial?.sourceSystemId)
  const destinations = selectableSystems(systems, initial?.destinationSystemId)
  const middlewares = selectableSystems(systems, initial?.middlewareSystemId ?? undefined)
  const addButton = (role: SystemRole) => user && canEdit(user) && <button type="button" className="text-xs text-violet-300 underline-offset-4 hover:underline" disabled={busy || systemBusy} onClick={() => setAdding(role)}>+ Yeni sistem ekle</button>
  const valid = name.trim() && sources.some((item) => item.id === Number(sourceSystemId)) && destinations.some((item) => item.id === Number(destinationSystemId)) && (!hasMiddleware || middlewares.some((item) => item.id === Number(middlewareSystemId)))
  return (
    <><form className="form-surface" onChange={() => onDirty?.()} onSubmit={(event) => {
      event.preventDefault()
      if (!valid || busy || systemBusy || catalog.loading || catalog.error) return
      void onSave({ serviceName: name, description, sourceSystemId: Number(sourceSystemId), destinationSystemId: Number(destinationSystemId), middlewareSystemId: hasMiddleware ? Number(middlewareSystemId) : null, hasMiddleware, syncType, formatSource, formatDestination }, saveIntent(event))
    }}>
      <SectionHeader icon="catalog" title="Temel bilgiler" description="Servisinizi tanımlayın, sistemlerini ve veri akışını belirleyin." actions={<button type="button" className="btn" disabled={busy || catalog.loading} onClick={catalog.reload}><AppIcon name="refresh" />Sistemleri yenile</button>} />
      {catalog.error && <div className="form-content"><ErrorPanel error={catalog.error} /></div>}
      {catalog.loading && <Loading />}
      {initial && <div className="px-5 pt-5"><p className="form-note"><AppIcon name="info" /><span>İsim ve açıklama güncellemesi mevcut durumu korur. Sistem, format veya akış değişikliği kaydı taslağa döndürür; ortamlar ve şemalar korunarak yeniden inceleme istenir.</span></p></div>}
      <fieldset disabled={busy || systemBusy || catalog.loading || !!catalog.error} className="min-w-0">
        <section className="form-section">
        <div className="form-section-heading"><AppIcon name="file" /><h3>Servis tanımı</h3><span>01</span></div>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <FormField label="Servis adı" field="name" error={error} className="label"><input className="field" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
          <FormField label="Açıklama (isteğe bağlı)" field="description" error={error} className="label"><textarea className="field" maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
        </div>
        </section>
        <section className="form-section">
        <div className="form-section-heading"><AppIcon name="link" /><h3>Bağlı sistemler</h3><span>02</span></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1"><FormField label="Kaynak sistem" field="sourceSystemId" error={error} className="label"><select className="field" required value={sourceSystemId} onChange={(event) => setSourceId(event.target.value)}><option value="">Kaynak seçin</option>{sources.map((item) => <option key={item.id} value={item.id}>{systemLabel(item)}</option>)}</select></FormField>{addButton('source')}</div>
          <div className="space-y-1"><FormField label="Hedef sistem" field="destinationSystemId" error={error} className="label"><select className="field" required value={destinationSystemId} onChange={(event) => setDestinationId(event.target.value)}><option value="">Hedef seçin</option>{destinations.map((item) => <option key={item.id} value={item.id}>{systemLabel(item)}</option>)}</select></FormField>{addButton('destination')}</div>
        </div>
        <label className="mt-5 flex min-h-9 items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={hasMiddleware} onChange={(event) => setHasMiddleware(event.target.checked)} />Ara katman kullan</label>
        {hasMiddleware && <div className="mt-3 space-y-1 sm:max-w-sm"><FormField label="Ara katman" field="middlewareSystemId" error={error} className="label"><select className="field" required value={middlewareSystemId} onChange={(event) => setMiddlewareId(event.target.value)}><option value="">Ara katman seçin</option>{middlewares.map((item) => <option key={item.id} value={item.id}>{systemLabel(item)}</option>)}</select></FormField><div className="flex flex-wrap items-center gap-x-3 gap-y-1">{addButton('middleware')}<span className="hint">Desteklenen formatlarda alanları eşleyebilirsiniz.</span></div></div>}
        {catalog.data && (!sources.length || !destinations.length || (hasMiddleware && !middlewares.length)) && <p role="status" className="hint">Gerekli sistemlerden biri henüz tanımlı değil. İlgili seçim alanının altındaki “Yeni sistem ekle” düğmesini kullanabilirsiniz.</p>}
        </section>
        <section className="form-section">
        <div className="form-section-heading"><AppIcon name="code" /><h3>Veri formatı ve akış</h3><span>03</span></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Kaynak format" field="sourcePayloadFormat" error={error} className="label"><select className="field" value={formatSource} onChange={(event) => setFormatSource(event.target.value as PayloadFormat)}>{payloadFormats.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></FormField>
          <FormField label="Hedef format" field="destinationPayloadFormat" error={error} className="label"><select className="field" value={formatDestination} onChange={(event) => setFormatDestination(event.target.value as PayloadFormat)}>{payloadFormats.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></FormField>
          <FormField label="Akış" field="isSync" error={error} className="label"><select className="field" value={syncType} onChange={(event) => setSyncType(event.target.value as 'sync' | 'async')}><option value="async">Asenkron</option><option value="sync">Senkron</option></select></FormField>
        </div>
        <p className="hint">{syncType === 'sync' ? 'Senkron akış yanıt bekler. İstek ve yanıt yapıları zorunludur.' : 'Asenkron akış yanıt beklemez. İstek yapısı zorunlu, yanıt isteğe bağlıdır.'}</p>
        </section>
        <div className="form-footer"><SaveActions busy={busy || systemBusy} saving={saving} disabled={!valid} creating={!initial} /></div>
      </fieldset>
    </form>
    {adding && <InlineSystemDialog onBusyChange={(value) => { setSystemBusy(value); onBusyChange(value) }} onClose={() => { setAdding(undefined); catalog.reload() }} onCreated={(item) => {
      setAdded((current) => [...current, item])
      if (adding === 'source') setSourceId(String(item.id))
      else if (adding === 'destination') setDestinationId(String(item.id))
      else setMiddlewareId(String(item.id))
      onDirty?.(); setAdding(undefined); catalog.reload()
    }} />}</>
  )
}

import { useState } from 'react'
import { allowedSchemas, requiredSchemas, schemaLabels } from '../../lib/integrationWorkflow'
import type { WorkspaceMutation } from '../../lib/integrationWorkflow'
import { contentRequest, defaultCsvOptions, expectedSchemaFormat, expectedTargetFormat, formatFileSize, hasIndependentTarget, isDirectSchema, payloadExtensions, schemaFormat, schemaText, targetContent, targetText, validateCsvOptions, validateSampleFile } from '../../lib/payload'
import { saveSchemaContent, uploadSchemaSample } from '../../services/integrationsBackend'
import type { CsvOptions, IntegrationRecord, MappingSchema, SchemaType } from '../../types/integration'
import { SaveActions } from './SaveActions'
import { SampleFileInfo, SchemaSample } from './SchemaSample'
import { saveIntent } from '../../lib/form'
import { AppIcon } from '../ui/AppIcon'
import { SectionHeader } from '../ui/PageLayout'

interface PayloadDraft {
  mode: 'text' | 'file'
  text: string
  csvOptions: CsvOptions
  file?: File
  fileVersion: number
  targetEnabled: boolean
  targetText: string
}
function initialDraft(record: IntegrationRecord, type: SchemaType, saved?: MappingSchema): PayloadDraft {
  const format = expectedSchemaFormat(record, type)
  const matches = saved && schemaFormat(saved) === format
  const targetFormat = expectedTargetFormat(record, type)
  const direct = !record.hasMiddleware && isDirectSchema(type) && !['CSV', 'EXCEL'].includes(format) && !['CSV', 'EXCEL'].includes(targetFormat)
  return { mode: format === 'EXCEL' ? 'file' : 'text', text: matches ? schemaText(saved) : '', csvOptions: matches ? saved.csvOptions ?? { ...defaultCsvOptions } : { ...defaultCsvOptions }, fileVersion: 0,
    targetEnabled: direct && (format !== targetFormat || hasIndependentTarget(saved)), targetText: direct && (saved?.targetFormat ?? 'JSON') === targetFormat ? targetText(saved) : '',
  }
}
function optionsChanged(draft: PayloadDraft, saved?: MappingSchema) {
  const previous = saved?.csvOptions ?? defaultCsvOptions
  return draft.csvOptions.delimiter !== previous.delimiter || draft.csvOptions.hasHeader !== previous.hasHeader
}

export function SchemaEditor({ record, schemas, busy, saving, onDirty, mutate, onBack }: {
  record: IntegrationRecord; schemas: MappingSchema[]; busy: boolean; saving: boolean
  onDirty: () => void; onBack: () => void; mutate: WorkspaceMutation
}) {
  const allowed = allowedSchemas(record)
  const required = requiredSchemas(record)
  const labels = schemaLabels(record)
  const [drafts, setDrafts] = useState<Partial<Record<SchemaType, PayloadDraft>>>(() => Object.fromEntries(allowed.map((type) => [type, initialDraft(record, type, schemas.find((schema) => schema.schemaType === type))])))
  const [failedType, setFailedType] = useState<SchemaType>()
  const incompatible = schemas.filter((item) => !allowed.includes(item.schemaType))
  const change = (type: SchemaType, update: Partial<PayloadDraft>) => {
    setDrafts((current) => ({ ...current, [type]: { ...current[type]!, ...update } }))
    onDirty()
  }
  const changed = (type: SchemaType) => {
    const draft = drafts[type]!
    const saved = schemas.find((schema) => schema.schemaType === type)
    const format = expectedSchemaFormat(record, type)
    const previous = saved && schemaFormat(saved) === format ? schemaText(saved) : ''
    const hasContent = Boolean(draft.text.trim() || draft.file || draft.targetText.trim())
    return (draft.mode === 'file' ? Boolean(draft.file) : draft.text !== previous) || (format === 'CSV' && optionsChanged(draft, saved)) || (hasContent && draft.targetEnabled && (draft.targetText !== targetText(saved) || !hasIndependentTarget(saved)))
  }
  const prepare = (type: SchemaType) => {
    const draft = drafts[type]!
    const format = expectedSchemaFormat(record, type)
    const target = draft.targetEnabled ? targetContent(expectedTargetFormat(record, type), draft.targetText) : {}
    if (draft.mode === 'file') {
      if (!draft.file) throw new Error('Yüklemek için bir örnek dosya seçin.')
      validateSampleFile(draft.file, format)
      const metadata = { schemaType: type, format, ...target, ...(format === 'CSV' ? { csvOptions: validateCsvOptions(draft.csvOptions) } : {}) }
      return () => uploadSchemaSample(record.id, metadata, draft.file!)
    }
    const content = { ...contentRequest(type, format, draft.text, draft.csvOptions), ...target }
    const saved = schemas.find((schema) => schema.schemaType === type)
    if (format === 'JSON' && saved?.samplePayload && draft.text === schemaText(saved)) content.samplePayload = saved.samplePayload
    return () => saveSchemaContent(record.id, content)
  }
  const editor = (type: SchemaType) => {
    const saved = schemas.find((schema) => schema.schemaType === type)
    const format = expectedSchemaFormat(record, type)
    const targetFormat = expectedTargetFormat(record, type)
    const targetAvailable = !record.hasMiddleware && isDirectSchema(type) && !['CSV', 'EXCEL'].includes(format) && !['CSV', 'EXCEL'].includes(targetFormat)
    const draft = drafts[type]!
    const isChanged = changed(type)
    let error = ''
    if (isChanged) {
      try { prepare(type) } catch (failure) { error = (failure as Error).message }
    }
    return <section aria-label={labels[type]} className="schema-card min-w-0 border">
      <div className="schema-card-heading flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><AppIcon name="code" /><h3 className="min-w-0 break-words text-xs font-medium">{labels[type]} · {format}</h3></div><span className={`text-[10px] ${isChanged ? 'text-amber-200' : saved ? 'text-emerald-300' : 'text-slate-400'}`}>{isChanged ? 'Kaydedilmedi' : saved ? 'Kayıtlı' : required.includes(type) ? 'Zorunlu · henüz eklenmedi' : 'İsteğe bağlı'}</span></div>
      <div className="schema-card-body space-y-3">
      {saved && schemaFormat(saved) !== format && <p className="text-xs text-amber-200">Mevcut örnek {schemaFormat(saved)} olarak kayıtlı. Bu yön için {format} örneğini yeniden kaydedin.</p>}
      {saved && <SampleFileInfo integrationId={record.id} schema={saved} disabled={busy} />}
      {format !== 'EXCEL' && <label className="label">İçerik ekleme yöntemi<select className="field" value={draft.mode} onChange={(event) => change(type, { mode: event.target.value as PayloadDraft['mode'] })}><option value="text">Metin gir / yapıştır</option><option value="file">Dosya yükle</option></select></label>}
      {draft.mode === 'file' ? <div className="space-y-2">
        <label className="label">Örnek dosya ({format})<input key={draft.fileVersion} className="field max-w-full text-xs" type="file" accept={payloadExtensions[format]} onChange={(event) => change(type, { file: event.target.files?.[0] })} /></label>
        {draft.file && <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 break-all text-xs text-slate-300">Seçilen: {draft.file.name} · {formatFileSize(draft.file.size)}</p><button type="button" className="btn" onClick={() => change(type, { file: undefined, fileVersion: draft.fileVersion + 1 })}>Dosya seçimini kaldır</button></div>}
        <p className="hint">{payloadExtensions[format]} · En fazla {format === 'EXCEL' ? '5' : '1'} MiB{format === 'EXCEL' ? ' · Şifresiz workbook' : ' · UTF-8'}</p>
      </div> : <label className="label">{format} içeriği<textarea className="field resize-y font-mono" rows={7} spellCheck={false} aria-invalid={Boolean(error)} value={draft.text} placeholder={format === 'JSON' ? '{\n  "orderId": "12345"\n}' : format === 'CSV' ? 'id,name\n42,Örnek' : format === 'IDOC' ? '<ORDERS05><IDOC BEGIN="1">...</IDOC></ORDERS05>' : '<order>\n  <id>42</id>\n</order>'} onChange={(event) => change(type, { text: event.target.value })} /></label>}
      {format === 'CSV' && <div className="grid gap-3 sm:grid-cols-2"><label className="label">CSV ayırıcı<select className="field" value={[',', ';', '\t', '|'].includes(draft.csvOptions.delimiter) ? draft.csvOptions.delimiter : 'custom'} onChange={(event) => change(type, { csvOptions: { ...draft.csvOptions, delimiter: event.target.value === 'custom' ? ':' : event.target.value } })}><option value=",">Virgül (,)</option><option value=";">Noktalı virgül (;)</option><option value={'\t'}>Sekme</option><option value="|">Dikey çizgi (|)</option><option value="custom">Özel ayırıcı</option></select></label>{![',', ';', '\t', '|'].includes(draft.csvOptions.delimiter) && <label className="label">Özel CSV ayırıcı<input className="field" maxLength={1} value={draft.csvOptions.delimiter} onChange={(event) => change(type, { csvOptions: { ...draft.csvOptions, delimiter: event.target.value } })} /></label>}<label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={draft.csvOptions.hasHeader} onChange={(event) => change(type, { csvOptions: { ...draft.csvOptions, hasHeader: event.target.checked } })} />İlk satır başlık</label></div>}
      {format === 'IDOC' && <p className="hint">IDOC elemanı içeren XML örneği girin veya yükleyin.</p>}
      {['CSV', 'EXCEL'].includes(format) && <p className="hint">Bu formatta örnek içerik saklanır; alan eşlemesi desteklenmez.</p>}
      {targetAvailable && <div className="schema-target"><label><input type="checkbox" checked={draft.targetEnabled} disabled={format !== targetFormat || hasIndependentTarget(saved)} onChange={(event) => change(type, { targetEnabled: event.target.checked })} />Hedef örneği tanımla · {type === 'DEST_TO_SOURCE_RESPONSE' ? record.sourceSystem : record.destinationSystem}</label><p>{format !== targetFormat ? 'Karma formatlı doğrudan akışta hedef örneği zorunludur.' : 'AI önerisi ve alan eşleme için bağımsız hedef örneğini ekleyin.'} JSON örneği/alan tanımı veya XML/IDOC içeriği kullanabilirsiniz.</p>{draft.targetEnabled && <label className="label">Hedef {targetFormat} içeriği<textarea className="field resize-y font-mono" rows={6} spellCheck={false} value={draft.targetText} placeholder={targetFormat === 'JSON' ? '{\n  "externalId": "12345"\n}' : targetFormat === 'IDOC' ? '<ORDERS05><IDOC BEGIN="1">...</IDOC></ORDERS05>' : '<order><externalId>12345</externalId></order>'} onChange={(event) => change(type, { targetText: event.target.value })} /></label>}</div>}
      {saved && isChanged && <p className="hint text-amber-200">Kaydettiğinizde bu yöndeki mevcut örnek değiştirilecek.</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {failedType === type && <p className="text-xs text-rose-300">Bu örnek kaydedilemedi. Hata açıklamasını kontrol edin; girdiniz korunuyor.</p>}
      </div>
    </section>
  }
  return <form className="schema-layout" onSubmit={(event) => {
    event.preventDefault()
    if (busy) return
    const intent = saveIntent(event)
    void mutate(async () => {
      setFailedType(undefined)
      // Prepare every changed slot before the first write. Each upsert is a separate transaction.
      const changes = allowed.filter(changed).map((type) => ({ type, save: prepare(type) }))
      for (const { type, save } of changes) {
        try {
          const saved = await save()
          setDrafts((current) => ({ ...current, [type]: { ...initialDraft(record, type, saved), fileVersion: current[type]!.fileVersion + 1 } }))
        } catch (failure) { setFailedType(type); throw failure }
      }
    }, 'İstek ve yanıt örnekleri kaydedildi.', intent, { refreshOnError: true })
  }}>
    <SectionHeader icon="code" title="İstek ve yanıt örnekleri" description="Her yön için seçili formatta metin girin veya dosya yükleyin. Senkron akışta yanıt da zorunludur; asenkron akışta yanıt isteğe bağlıdır." />
    <p className="form-note"><AppIcon name="info" /><span>Her yönde tek örnek saklanır; yeni kayıt önceki örneğin yerini alır.</span></p>
    {incompatible.length > 0 && <section aria-label="Önceki akışa ait örnekler" className="min-w-0 space-y-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
      <h3 className="text-sm font-medium text-amber-200">Önceki akışa ait örnekler</h3>
      <p role="alert" className="error-panel">Önceki akıştan kalan veri yapıları: {incompatible.map((item) => labels[item.schemaType]).join(', ')}. Bu yapılar mevcut akışla uyumlu değil. Önceki akışı seçebilir veya yeni bir entegrasyon oluşturabilirsiniz; inceleme onayı eski yapıları kaldırmaz.</p>
      {incompatible.map((item) => <SchemaSample key={item.id} record={record} schema={item} disabled={busy} />)}
    </section>}
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <div className={`grid gap-3 ${required.length > 1 ? 'lg:grid-cols-2' : ''}`}>{required.map((type) => <div key={type} className="min-w-0">{editor(type)}</div>)}</div>
      {allowed.filter((type) => !required.includes(type)).map((type) => <details key={type} className="schema-optional"><summary className="cursor-pointer break-words">{labels[type]} — İsteğe bağlı</summary><div className="mt-3">{editor(type)}</div></details>)}
      <div className="form-footer rounded-lg border"><SaveActions busy={busy} saving={saving} onBack={onBack} /></div>
    </fieldset>
  </form>
}

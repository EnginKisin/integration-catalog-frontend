import { useEffect, useRef } from 'react'
import { useTask } from '../../hooks/useRequest'
import { formatFileSize, hasIndependentTarget, schemaFormat, schemaText, targetText } from '../../lib/payload'
import { schemaLabels } from '../../lib/integrationWorkflow'
import { downloadSchemaSample } from '../../services/integrationsBackend'
import type { IntegrationRecord, MappingSchema } from '../../types/integration'
import { ErrorPanel } from '../ui/feedback'

export function SampleFileInfo({ integrationId, schema, disabled = false }: { integrationId: string; schema: MappingSchema; disabled?: boolean }) {
  const task = useTask()
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  if (!schema.fileName) return null
  return <div className="space-y-2 rounded-lg bg-white/[0.03] p-3">
    <p className="break-all text-xs text-slate-300">Kayıtlı dosya: {schema.fileName}{schema.fileSize != null ? ` · ${formatFileSize(schema.fileSize)}` : ''}</p>
    {schema.sampleDownloadUrl && <button type="button" className="btn" disabled={disabled || task.busy} onClick={() => void task.run(async () => {
      const blob = await downloadSchemaSample(integrationId, schema.id)
      if (!active.current) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = schema.fileName!
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    })}>{task.busy ? 'İndiriliyor…' : 'Örnek dosyayı indir'}</button>}
    <ErrorPanel error={task.error} />
  </div>
}

export function SchemaSample({ record, schema, disabled }: { record: IntegrationRecord; schema: MappingSchema; disabled?: boolean }) {
  const format = schemaFormat(schema)
  const text = schemaText(schema)
  return <details className="schema-sample min-w-0 rounded-lg border p-3">
    <summary className="cursor-pointer break-words text-sm">{schemaLabels(record)[schema.schemaType]} · {format} (#{schema.id})</summary>
    <div className="mt-3 space-y-3">
      <SampleFileInfo integrationId={record.id} schema={schema} disabled={disabled} />
      {text && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{text}</pre>}
      {hasIndependentTarget(schema) && <div><p className="mb-2 text-xs text-emerald-200">Bağımsız hedef örneği · {schema.targetFormat ?? 'JSON'}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{targetText(schema)}</pre></div>}
      {format === 'EXCEL' && <p className="hint">Excel örneğini indirerek inceleyebilirsiniz.</p>}
      {format === 'CSV' && <p className="hint">Ayırıcı: {schema.csvOptions?.delimiter === '\t' ? 'Sekme' : schema.csvOptions?.delimiter ?? ','} · {schema.csvOptions?.hasHeader === false ? 'Başlık yok' : 'İlk satır başlık'}</p>}
    </div>
  </details>
}

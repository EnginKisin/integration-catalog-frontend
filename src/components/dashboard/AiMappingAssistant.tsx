import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import type { AiCapabilities, AiJob, AiJobRequest, AiMappingResult, AppendMappingRequest, MappingContext } from '../../types/aiMapping'
import type { FieldMapping, IntegrationRecord } from '../../types/integration'
import type { MappingDraft, MappingPair } from '../../lib/mapping'
import { mappingPairs } from '../../lib/mapping'
import { aiErrorMessages, aiErrorText, aiJobErrorText, canonicalFieldPath, canonicalMapping, protectedDrafts, suggestionIssues } from '../../lib/aiMapping'
import type { SuggestionDraft } from '../../lib/aiMapping'
import { studioSchemaTree } from '../../lib/mappingStudio'
import { hasIndependentTarget, schemaFormat } from '../../lib/payload'
import { ApiError } from '../../services/api'
import { mappingDiagnosticText } from '../../lib/apiErrors'
import { createAiJob, fetchAiCapabilities, fetchAiJob, fetchAiResult, fetchMappingContext } from '../../services/aiMappingBackend'
import { AppIcon } from '../ui/AppIcon'
import './ai-mapping.css'

interface Props {
  record: IntegrationRecord
  pair: MappingPair
  pairs: MappingPair[]
  rows: MappingDraft[]
  saved: FieldMapping[]
  busy: boolean
  onPendingChange: (pending: boolean) => void
  onAccept: (input: AppendMappingRequest, key: string) => Promise<boolean>
}
interface StartAttempt { key: string; input: AiJobRequest; context: MappingContext }
const uncertain = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 500) && !['AI_DISABLED', 'AI_PROVIDER_NOT_SUPPORTED', 'AI_API_KEY_MISSING', 'AI_CONFIGURATION_INVALID'].includes(error.code ?? '')

export function AiMappingAssistant({ record, pair, pairs, rows, saved, busy, onAccept, onPendingChange }: Props) {
  const [capabilities, setCapabilities] = useState<AiCapabilities>()
  const [capabilityError, setCapabilityError] = useState(false)
  const [capabilityVersion, setCapabilityVersion] = useState(0)
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<AiJob>()
  const [context, setContext] = useState<MappingContext>()
  const [result, setResult] = useState<AiMappingResult>()
  const [suggestions, setSuggestions] = useState<SuggestionDraft[]>([])
  const [error, setError] = useState('')
  const [retryStart, setRetryStart] = useState(false)
  const [pollVersion, setPollVersion] = useState(0)
  const [pollError, setPollError] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [notice, setNotice] = useState('')
  const [expiredJob, setExpiredJob] = useState<string>()
  const pendingStart = useRef<StartAttempt | null>(null)
  const pendingAppend = useRef<{ key: string; input: AppendMappingRequest } | null>(null)
  const alive = useRef(true)
  const notifyPending = useEffectEvent(onPendingChange)
  const startAbort = useRef<AbortController | null>(null)
  const listId = useId()
  const running = starting || Boolean(!pollError && job && ['QUEUED', 'RUNNING'].includes(job.status))
  const selected = suggestions.filter((item) => item.selected)
  const pending = selected.length > 0 && Boolean(result)
  useEffect(() => { notifyPending(pending) }, [pending])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; startAbort.current?.abort(); notifyPending(false) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void fetchAiCapabilities(record.id, controller.signal).then((value) => { if (active) { setCapabilities(value); setCapabilityError(false) } }).catch(() => { if (active) { setCapabilities(undefined); setCapabilityError(true) } })
    return () => { active = false; controller.abort() }
  }, [record.id, capabilityVersion])

  useEffect(() => {
    if (!job?.expiresAt) return
    const delay = Date.parse(job.expiresAt) - Date.now()
    if (!Number.isFinite(delay)) return
    const timer = window.setTimeout(() => setExpiredJob(job.jobId), Math.max(0, Math.min(delay, 2147483647)))
    return () => window.clearTimeout(timer)
  }, [job?.jobId, job?.expiresAt])

  useEffect(() => {
    if (!job || job.status === 'FAILED' || job.status === 'EXPIRED') return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => {
      if (job.expiresAt && Date.parse(job.expiresAt) <= Date.now()) { setError(aiErrorMessages.AI_RESULT_EXPIRED); setPollError(true); return }
      void (async () => {
        try {
          if (job.status === 'SUCCEEDED') {
            const value = await fetchAiResult(record.id, job.jobId, controller.signal)
            if (!active) return
            if (value.suggestions.some((item) => item.sourceSchemaId !== pair.source?.id || item.targetSchemaId !== pair.target?.id)) throw new Error('AI yanıtındaki şema çifti seçili akışla uyuşmuyor. Yeni öneri oluşturun.')
            if (value.contextRevision !== pendingStart.current?.input.expectedContextRevision) value.stale = true
            setResult(value); setSuggestions(value.suggestions.map((item) => ({ ...item, selected: true }))); setPollError(false)
          } else {
            const next = await fetchAiJob(record.id, job.jobId, controller.signal)
            if (!active) return
            if (next.jobId !== job.jobId) throw new Error('AI işlem yanıtı beklenen işlemle eşleşmiyor.')
            setJob(next); setPollError(false)
            if (next.status === 'FAILED') setError(aiJobErrorText(next.errorCode))
            if (next.status === 'EXPIRED') { setExpiredJob(next.jobId); setError(aiErrorMessages.AI_RESULT_EXPIRED) }
          }
        } catch (failure) { if (active) { setError(aiErrorText(failure)); setPollError(true) } }
      })()
    }, job.status === 'SUCCEEDED' ? 0 : Math.max(1000, Math.min(60000, job.pollAfterMs ?? 2000)))
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [record.id, job, pollVersion, pair.source?.id, pair.target?.id])

  const activePairs = useMemo(() => context ? mappingPairs(record, context.schemas) : pairs, [context, record, pairs])
  const activePair = activePairs.find((item) => item.key === pair.key) ?? pair
  const fields = useMemo(() => ({
    source: studioSchemaTree(activePair.source).fields.filter((field) => !field.children.length).map((field) => canonicalFieldPath(field.path, schemaFormat(activePair.source!))),
    target: studioSchemaTree(activePair.target).fields.filter((field) => !field.children.length).map((field) => canonicalFieldPath(field.path, schemaFormat(activePair.target!))),
  }), [activePair])
  const issues = suggestionIssues(suggestions, rows, activePairs)
  const ready = capabilities?.enabled && capabilities.available
  const supported = Boolean(pair.source && pair.target && capabilities?.supportedFormats.includes(schemaFormat(pair.source)) && capabilities.supportedFormats.includes(schemaFormat(pair.target)))
  const sampleMissing = !record.hasMiddleware && !hasIndependentTarget(pair.source)
  const expired = Boolean(job && (expiredJob === job.jobId || job.status === 'EXPIRED'))
  const stale = result?.stale || expired

  const generate = async () => {
    if (busy || running || accepting || !ready || !supported || sampleMissing) return
    if (pending && !window.confirm('Kaydedilmemiş AI önerileri yeni önerilerle değiştirilecek. Devam edilsin mi?')) return
    setStarting(true); setError(''); setNotice(''); setPollError(false); setResult(undefined); setSuggestions([]); setJob(undefined)
    const controller = new AbortController()
    startAbort.current = controller
    if (!retryStart) pendingStart.current = null
    try {
      let attempt = pendingStart.current
      if (!retryStart || !attempt) {
        const current = await fetchMappingContext(record.id, controller.signal)
        if (!alive.current) return
        const currentPairs = mappingPairs(record, current.schemas)
        const currentPair = currentPairs.find((item) => item.key === pair.key)
        if (!currentPair?.source || !currentPair.target || currentPair.source.id !== pair.source?.id || currentPair.target.id !== pair.target?.id) throw new Error('Seçili örnekler değişti. Kaydı yenileyip akışı tekrar seçin.')
        attempt = { key: crypto.randomUUID(), context: current, input: { sourceSchemaId: currentPair.source.id, targetSchemaId: currentPair.target.id, expectedContextRevision: current.contextRevision, protectedMappings: protectedDrafts(rows, saved, currentPair, currentPairs), options: { useSampleValues: true } } }
        pendingStart.current = attempt
      }
      setContext(attempt.context)
      const created = await createAiJob(record.id, attempt.input, attempt.key, controller.signal)
      if (!alive.current) return
      setRetryStart(false); setJob(created)
      if (created.status === 'FAILED') setError(aiJobErrorText(created.errorCode))
      if (created.status === 'EXPIRED') setError(aiErrorMessages.AI_RESULT_EXPIRED)
    } catch (failure) {
      if (!alive.current) return
      const retry = Boolean(pendingStart.current && uncertain(failure))
      setRetryStart(retry); setError(retry ? 'İşlem isteğinin sonucu doğrulanamadı. Yeniden denediğinizde aynı işlem anahtarı kullanılacak; ikinci bir iş oluşturulmaz.' : aiErrorText(failure))
      if (!retry) pendingStart.current = null
    } finally { if (alive.current) setStarting(false) }
  }
  const accept = async () => {
    if (!result || busy || accepting || !selected.length || issues.length || stale) return
    if (job?.expiresAt && Date.parse(job.expiresAt) <= Date.now()) { setResult({ ...result, stale: true }); setError(aiErrorMessages.AI_RESULT_EXPIRED); return }
    setAccepting(true); setError('')
    try {
      const input: AppendMappingRequest = { expectedContextRevision: result.contextRevision, aiJobId: result.jobId, mappings: selected.map((item) => ({ ...canonicalMapping(item, activePairs), suggestionId: item.suggestionId })) }
      const previous = pendingAppend.current
      const attempt = previous && JSON.stringify(previous.input) === JSON.stringify(input) ? previous : { input, key: crypto.randomUUID() }
      pendingAppend.current = attempt
      const success = await onAccept(attempt.input, attempt.key)
      if (success && alive.current) { setNotice(`${selected.length} öneri mevcut bağlantılar korunarak eklendi.`); setResult(undefined); setSuggestions([]); setJob(undefined); pendingAppend.current = null }
    } catch (failure) {
      if (alive.current) {
        setError(aiErrorText(failure))
        if (failure instanceof ApiError && ['CONTEXT_CHANGED', 'AI_RESULT_EXPIRED'].includes(failure.code ?? '')) setResult((value) => value ? { ...value, stale: true } : value)
      }
    } finally { if (alive.current) setAccepting(false) }
  }
  const edit = (id: string, change: Partial<SuggestionDraft>) => { setSuggestions((current) => current.map((item) => item.suggestionId === id ? { ...item, ...change } : item)); setError('') }

  return <section className="ai-assistant" aria-label="AI eşleme asistanı">
    <header className="ai-heading"><span className="ai-heading-icon"><AppIcon name="sparkles" /></span><div><h3>AI eşleme asistanı <span>Öneri</span></h3><p>Alan adları, tipleri ve örneklerden bağlantı önerileri alın. Son kararı siz verin.</p></div><button type="button" className="btn-primary" disabled={busy || running || accepting || !ready || !supported || sampleMissing} onClick={() => void generate()}><AppIcon name="sparkles" />{starting ? 'İşlem başlatılıyor…' : running ? 'Öneriler hazırlanıyor…' : retryStart ? 'Aynı isteği yeniden dene' : result ? 'Yeni öneri oluştur' : 'AI ile eşleştir'}</button></header>
    {(!ready || !supported || sampleMissing) && <div className="ai-availability" role="status"><AppIcon name="info" /><span>{sampleMissing ? aiErrorMessages.SAMPLE_REQUIRED : capabilityError ? 'AI kullanılabilirliği kontrol edilemedi. Manuel eşlemeye devam edebilirsiniz.' : !capabilities ? 'AI kullanılabilirliği kontrol ediliyor…' : !ready ? aiJobErrorText(capabilities.code) : aiErrorMessages.AI_FORMAT_NOT_SUPPORTED}</span>{(capabilityError || capabilities) && <button type="button" className="ai-text-button" disabled={busy || running} onClick={() => setCapabilityVersion((value) => value + 1)}>Tekrar kontrol et</button>}</div>}
    {running && !pollError && <div className="ai-progress" role="status"><span className="ai-spinner" /><div><strong>{job?.status === 'QUEUED' ? 'İşlem sırada' : 'Alanlar değerlendiriliyor'}</strong><p>Bu işlem biraz sürebilir. Manuel eşlemeye devam edebilirsiniz; önerileri görmek için bu adımı açık tutun.</p></div></div>}
    {error && <div className="ai-message is-error" role="alert"><AppIcon name="info" /><span>{error}</span>{pollError && <button type="button" className="ai-text-button" disabled={busy} onClick={() => { setError(''); setPollError(false); setPollVersion((value) => value + 1) }}>Durumu yeniden sorgula</button>}</div>}
    {notice && <p className="ai-message is-success" role="status"><AppIcon name="check" />{notice}</p>}
    {result && <div className="ai-results">
      <div className="ai-result-heading"><div><h4>{suggestions.length ? `${suggestions.length} bağlantı önerisi` : 'Güvenilir bir eşleşme bulunamadı'}</h4><p>{suggestions.length ? 'Önerileri seçin, alan yollarını düzenleyin veya istemediklerinizi kaldırın.' : 'Belirsiz alanlar zorla eşleştirilmedi. Örnekleri geliştirebilir veya manuel bağlantı ekleyebilirsiniz.'}</p></div><button type="button" className="ai-text-button" disabled={busy || accepting} onClick={() => { setResult(undefined); setSuggestions([]); setJob(undefined); setError('') }}>Önerileri kapat</button></div>
      {stale && <p className="ai-message is-warning" role="status">Bu öneriler güncel değil veya süreleri doldu. Kaydetmeden önce yeni öneri oluşturun.</p>}
      {suggestions.length > 0 && <>
        <label className="ai-select-all"><input type="checkbox" checked={selected.length === suggestions.length} disabled={busy || accepting || stale} onChange={(event) => setSuggestions((current) => current.map((item) => ({ ...item, selected: event.target.checked })))} />Tüm önerileri seç<span>{selected.length} seçili</span></label>
        <datalist id={`${listId}-source`}>{fields.source.map((path) => <option key={path} value={path} />)}</datalist><datalist id={`${listId}-target`}>{fields.target.map((path) => <option key={path} value={path} />)}</datalist>
        <div className="ai-suggestion-list">{suggestions.map((item, index) => {
          const original = result.suggestions.find((suggestion) => suggestion.suggestionId === item.suggestionId)!
          const edited = item.sourceFieldPath !== original.sourceFieldPath || item.targetFieldPath !== original.targetFieldPath
          return <article key={item.suggestionId} className={`ai-suggestion ${item.selected ? 'is-selected' : ''}`} aria-label={`AI önerisi ${index + 1}`}>
            <div className="ai-suggestion-top"><label><input type="checkbox" checked={item.selected} disabled={busy || accepting || stale} onChange={(event) => edit(item.suggestionId, { selected: event.target.checked })} />Öneri {index + 1}</label><span className={`ai-confidence ${item.confidence === 'HIGH' ? 'is-high' : ''}`}>{item.confidence === 'HIGH' ? 'Yüksek güven' : 'Orta güven'}</span>{edited && <span className="ai-edited">Düzenlendi</span>}<button type="button" className="ai-text-button" disabled={busy || accepting} onClick={() => setSuggestions((current) => current.filter((suggestion) => suggestion.suggestionId !== item.suggestionId))}>Öneriyi kaldır</button></div>
            <div className="ai-paths"><label className="label">Önerilen kaynak alan<input className="field" maxLength={500} list={`${listId}-source`} value={item.sourceFieldPath} disabled={busy || accepting || stale} onChange={(event) => edit(item.suggestionId, { sourceFieldPath: event.target.value })} /></label><AppIcon name="arrow" /><label className="label">Önerilen hedef alan<input className="field" maxLength={500} list={`${listId}-target`} value={item.targetFieldPath} disabled={busy || accepting || stale} onChange={(event) => edit(item.suggestionId, { targetFieldPath: event.target.value })} /></label></div><p className="ai-reason">{item.reason}</p>
          </article>
        })}</div>
      </>}
      {issues.length > 0 && <div className="ai-message is-warning" role="status"><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {result.warnings.length > 0 && <div className="ai-message is-warning">{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      {(result.unmatchedSourceFields.length > 0 || result.unmatchedTargetFields.length > 0) && <details className="ai-unmatched"><summary>Eşleşmeyen alanlar <span>{result.unmatchedSourceFields.length + result.unmatchedTargetFields.length}</span></summary><div className="ai-unmatched-grid">{(['Source', 'Target'] as const).map((side) => <div key={side}><h5>{side === 'Source' ? 'Kaynak' : 'Hedef'} alanları</h5>{result[`unmatched${side}Fields`].length ? result[`unmatched${side}Fields`].map((field, index) => <div key={index}><code>{field.fieldPath}</code><p>{mappingDiagnosticText(field.code)}</p></div>) : <p>Eşleşmeyen alan yok.</p>}</div>)}</div></details>}
      <footer className="ai-result-footer"><p>Güven seviyeleri doğruluk yüzdesi değildir. Yalnızca onayladığınız bağlantılar eklenir.</p>{suggestions.length > 0 && <button type="button" className="btn-primary" disabled={busy || accepting || !selected.length || issues.length > 0 || stale} onClick={() => void accept()}><AppIcon name="check" />{accepting ? 'Öneriler ekleniyor…' : `Seçilen ${selected.length} öneriyi ekle`}</button>}</footer>
    </div>}
  </section>
}

import { ApiError, request } from './api.ts'
import type { AiCapabilities, AiJob, AiJobRequest, AiMappingResult, AppendMappingRequest, AppendMappingResult, MappingContext } from '../types/aiMapping'

function base(id: string) {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Geçerli bir entegrasyon seçin.')
  return `/integrations/${id}/mappings`
}
function jobPath(id: string, jobId: string) {
  if (!jobId.trim()) throw new Error('Öneri işlemi bulunamadı.')
  return `${base(id)}/ai/jobs/${encodeURIComponent(jobId)}`
}
function write<T>(path: string, body: unknown, key: string, signal?: AbortSignal) {
  if (!key.trim() || key.length > 100) throw new Error('İşlem anahtarı geçersiz.')
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body), signal })
}
const revision = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const invalid = () => new ApiError('AI servisinden beklenen yanıt alınamadı. Manuel eşlemeye devam edebilirsiniz.')
function checkedJob(job: AiJob) {
  if (!job || !revision(job.jobId) || !['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED'].includes(job.status)) throw invalid()
  return job
}
export async function fetchMappingContext(id: string, signal?: AbortSignal): Promise<MappingContext> {
  const context = await request<MappingContext>(`${base(id)}/context`, { signal })
  if (!context || !revision(context.contextRevision) || !Array.isArray(context.schemas) || !Array.isArray(context.mappings)) throw invalid()
  return context
}
export async function fetchAiCapabilities(id: string, signal?: AbortSignal): Promise<AiCapabilities> {
  const value = await request<AiCapabilities>(`${base(id)}/ai/capabilities`, { signal })
  if (!value || typeof value.enabled !== 'boolean' || typeof value.available !== 'boolean' || !Array.isArray(value.supportedFormats)) throw invalid()
  return value
}
export async function createAiJob(id: string, input: AiJobRequest, key: string, signal?: AbortSignal) {
  return checkedJob(await write<AiJob>(`${base(id)}/ai/jobs`, input, key, signal))
}
export async function fetchAiJob(id: string, jobId: string, signal?: AbortSignal) {
  return checkedJob(await request<AiJob>(jobPath(id, jobId), { signal }))
}
export async function fetchAiResult(id: string, jobId: string, signal?: AbortSignal): Promise<AiMappingResult> {
  // Use the authenticated same-origin endpoint, never an arbitrary provider URL.
  const result = await request<AiMappingResult>(`${jobPath(id, jobId)}/result`, { signal })
  if (!result || result.jobId !== jobId || !revision(result.contextRevision) || typeof result.stale !== 'boolean' || !Array.isArray(result.suggestions) || !Array.isArray(result.unmatchedSourceFields) || !Array.isArray(result.unmatchedTargetFields) || !Array.isArray(result.warnings)) throw invalid()
  const ids = new Set<string>()
  for (const item of result.suggestions) {
    if (!item || !revision(item.suggestionId) || ids.has(item.suggestionId) || !Number.isSafeInteger(item.sourceSchemaId) || !Number.isSafeInteger(item.targetSchemaId) || !revision(item.sourceFieldPath) || !revision(item.targetFieldPath) || !['HIGH', 'MEDIUM'].includes(item.confidence) || typeof item.reason !== 'string') throw invalid()
    ids.add(item.suggestionId)
  }
  if (!result.warnings.every((item) => typeof item === 'string') || ![...result.unmatchedSourceFields, ...result.unmatchedTargetFields].every((item) => item && typeof item.fieldPath === 'string' && typeof item.reason === 'string' && typeof item.code === 'string')) throw invalid()
  return result
}
export async function appendMappings(id: string, input: AppendMappingRequest, key: string): Promise<AppendMappingResult> {
  if (!revision(input.expectedContextRevision) || !input.mappings.length || input.mappings.some((item) => !Number.isSafeInteger(item.sourceSchemaId) || item.sourceSchemaId <= 0 || !Number.isSafeInteger(item.targetSchemaId) || item.targetSchemaId <= 0 || !item.sourceFieldPath.trim() || item.sourceFieldPath.length > 500 || !item.targetFieldPath.trim() || item.targetFieldPath.length > 500)) throw new Error('Kaydedilecek alan bağlantılarını kontrol edin.')
  const result = await write<AppendMappingResult>(`${base(id)}/fields/append`, {
    expectedContextRevision: input.expectedContextRevision,
    ...(input.aiJobId ? { aiJobId: input.aiJobId } : {}),
    mappings: input.mappings.map((item) => ({ sourceSchemaId: item.sourceSchemaId, sourceFieldPath: item.sourceFieldPath.trim(), targetSchemaId: item.targetSchemaId, targetFieldPath: item.targetFieldPath.trim(), ...(item.suggestionId ? { suggestionId: item.suggestionId } : {}) })),
  }, key)
  if (!result || !revision(result.contextRevision) || !Array.isArray(result.addedMappings) || result.addedMappings.length !== input.mappings.length || result.addedMappings.some((item) => !item || !Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.sourceFieldPath !== 'string' || typeof item.targetFieldPath !== 'string')) throw invalid()
  return result
}

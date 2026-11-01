import { ApiError, del, get, getBlob, patch, post, put, request } from './api.ts'
import { validateCsvOptions, validateSampleFile } from '../lib/payload.ts'
import type { ConfigRequest, EnvironmentConfig, FieldMapping, IntegrationDraftInput, IntegrationRecord, IntegrationWorkspaceData, MappingSchema, PayloadFormat, SchemaContentRequest, SchemaType, SchemaUploadMetadata, StatusType } from '../types/integration'
import type { MappingRequest } from '../lib/mapping'

interface BackendIntegration {
  id: number
  name: string
  description: string
  sourceSystemId: number
  destinationSystemId: number
  middlewareSystemId: number | null
  sourceSystemName: string
  destinationSystemName: string
  middlewareSystemName: string | null
  sourcePayloadFormat: Uppercase<PayloadFormat>
  destinationPayloadFormat: Uppercase<PayloadFormat>
  hasMiddleware: boolean
  isSync: boolean
  status: StatusType
  reviewRequired: boolean
  createdAt?: string
  updatedAt?: string | null
  environmentConfigs?: EnvironmentConfig[]
  environmentTypes: IntegrationRecord['environmentTypes']
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  // Backend LocalDateTime has no offset; never append a UTC suffix.
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
}
function toRecord(item: BackendIntegration): IntegrationRecord {
  if (!item || !Number.isSafeInteger(item.id) || item.id <= 0) throw new ApiError('Sunucudan geçerli kayıt yanıtı alınamadı. Tekrar kaydetmeden önce listeyi veya güncel kaydı kontrol edin.')
  return {
    id: String(item.id), serviceName: item.name, description: item.description,
    sourceSystemId: item.sourceSystemId, destinationSystemId: item.destinationSystemId, middlewareSystemId: item.middlewareSystemId,
    sourceSystem: item.sourceSystemName ?? `#${item.sourceSystemId}`,
    destinationSystem: item.destinationSystemName ?? `#${item.destinationSystemId}`,
    middleware: item.middlewareSystemId != null ? item.middlewareSystemName ?? `#${item.middlewareSystemId}` : undefined,
    hasMiddleware: item.hasMiddleware, syncType: item.isSync === false ? 'async' : 'sync',
    formatSource: item.sourcePayloadFormat?.toLowerCase() as PayloadFormat ?? 'json',
    formatDestination: item.destinationPayloadFormat?.toLowerCase() as PayloadFormat ?? 'json',
    status: item.status ?? 'DRAFT', reviewRequired: item.reviewRequired ?? false,
    lastUpdated: formatDate(item.updatedAt ?? item.createdAt), createdAt: item.createdAt, updatedAt: item.updatedAt,
    environmentTypes: item.environmentTypes ?? [],
    environmentConfigs: (item.environmentConfigs ?? []).map((config) => ({
      id: config.id, configTarget: config.configTarget, environmentType: config.environmentType, url: config.url,
      authType: config.authType, credentialsConfigured: config.credentialsConfigured,
      timeoutMs: config.timeoutMs, retryCount: config.retryCount, retryIntervalMs: config.retryIntervalMs,
    })),
  }
}
function toRequest(input: IntegrationDraftInput) {
  const validId = (id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0
  if (!validId(input.sourceSystemId) || !validId(input.destinationSystemId) || (input.hasMiddleware && !validId(input.middlewareSystemId))) {
    throw new Error('Aktif kaynak, hedef ve kullanılıyorsa ara katman seçin.')
  }
  if (!input.serviceName.trim() || input.serviceName.trim().length > 100 || (input.description?.length ?? 0) > 500) {
    throw new Error('İsim boş olamaz ve en fazla 100, açıklama en fazla 500 karakter olmalıdır.')
  }
  return {
    name: input.serviceName.trim(), description: input.description ?? '',
    sourceSystemId: input.sourceSystemId, destinationSystemId: input.destinationSystemId,
    middlewareSystemId: input.hasMiddleware ? input.middlewareSystemId : null,
    sourcePayloadFormat: input.formatSource.toUpperCase(), destinationPayloadFormat: input.formatDestination.toUpperCase(),
    isSync: input.syncType === 'sync', hasMiddleware: input.hasMiddleware,
  }
}
export async function fetchIntegrations(): Promise<IntegrationRecord[]> {
  const items = await get<BackendIntegration[]>('/integrations')
  return items.map(toRecord)
}
export async function createIntegration(input: IntegrationDraftInput): Promise<IntegrationRecord> {
  // Creation is a single draft write. No configs, schemas or completion side effects.
  return toRecord(await post<BackendIntegration>('/integrations', toRequest(input)))
}
export async function updateIntegration(id: string, input: IntegrationDraftInput): Promise<IntegrationRecord> {
  return toRecord(await put<BackendIntegration>(`/integrations/${id}`, toRequest(input)))
}
export async function fetchIntegrationWorkspace(id: string): Promise<IntegrationWorkspaceData> {
  // Verify the parent first: mapping GET alone can return [] for a missing record.
  const record = await get<BackendIntegration>(`/integrations/${id}`)
  const [schemas, mappings] = await Promise.all([
    get<MappingSchema[]>(`/integrations/${id}/mappings/schemas`), get<FieldMapping[]>(`/integrations/${id}/mappings/fields`),
  ])
  return { record: toRecord(record), schemas, mappings }
}
export const saveConfigs = (id: string, configs: ConfigRequest[]) => post(`/integrations/${id}/configs`, configs)
export const saveSchemaContent = (id: string, content: SchemaContentRequest) => post<MappingSchema>(`/integrations/${id}/mappings/schemas`, content)
export const saveSchema = (id: string, schemaType: SchemaType, schemaDefinition: Record<string, unknown>) => saveSchemaContent(id, { schemaType, format: 'JSON', schemaDefinition })
export function uploadSchemaSample(id: string, metadata: SchemaUploadMetadata, file: File): Promise<MappingSchema> {
  validateSampleFile(file, metadata.format)
  const clean: SchemaUploadMetadata = { schemaType: metadata.schemaType, format: metadata.format }
  if (metadata.format === 'CSV' && metadata.csvOptions) clean.csvOptions = validateCsvOptions(metadata.csvOptions)
  if (metadata.targetFormat && ['JSON', 'XML', 'IDOC'].includes(metadata.targetFormat)) {
    clean.targetFormat = metadata.targetFormat
    if (metadata.targetFormat === 'JSON') {
      if (metadata.targetSchemaDefinition) clean.targetSchemaDefinition = metadata.targetSchemaDefinition
      if (metadata.targetSamplePayload) clean.targetSamplePayload = metadata.targetSamplePayload
    } else if (metadata.targetRawContent !== undefined) clean.targetRawContent = metadata.targetRawContent
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(clean)], { type: 'application/json' }))
  form.append('file', file)
  return request<MappingSchema>(`/integrations/${id}/mappings/schemas/upload`, { method: 'POST', body: form })
}
export const downloadSchemaSample = (id: string, schemaId: number) => getBlob(`/integrations/${id}/mappings/schemas/${schemaId}/sample`)
export const saveMappings = (id: string, mappings: MappingRequest[]) => post(`/integrations/${id}/mappings/fields`, mappings.map((mapping) => ({
  sourceSchemaId: mapping.sourceSchemaId, sourceFieldPath: mapping.sourceFieldPath,
  targetSchemaId: mapping.targetSchemaId, targetFieldPath: mapping.targetFieldPath,
  isAiGenerated: false, aiConfidenceScore: null,
})))
export const confirmReview = (id: string) => post(`/integrations/${id}/review/confirm`, { confirmed: true })
export const completeIntegration = (id: string) => patch(`/integrations/${id}/complete`)
export const deleteIntegration = (id: string) => del(`/integrations/${id}`)
export const fetchCredentials = (id: string, config: EnvironmentConfig) => get<{ authCredentials: Record<string, unknown> }>(`/integrations/${id}/configs/${config.environmentType}/${config.configTarget}/credentials`)

export type SyncType = 'sync' | 'async'
export const payloadFormats = ['json', 'xml', 'idoc', 'csv', 'excel'] as const
export type PayloadFormat = typeof payloadFormats[number]
export type ApiPayloadFormat = Uppercase<PayloadFormat>
export interface CsvOptions { delimiter: string; hasHeader: boolean }
export interface IndependentTargetContent {
  targetFormat?: 'JSON' | 'XML' | 'IDOC'
  targetSchemaDefinition?: Record<string, unknown>
  targetSamplePayload?: Record<string, unknown>
  targetRawContent?: string
}
export type SchemaContentRequest = (
  | { schemaType: SchemaType; format: 'JSON'; schemaDefinition: Record<string, unknown> }
  | { schemaType: SchemaType; format: 'XML' | 'IDOC'; rawContent: string }
  | { schemaType: SchemaType; format: 'CSV'; rawContent: string; csvOptions: CsvOptions }
  ) & IndependentTargetContent & { samplePayload?: Record<string, unknown> }
export interface SchemaUploadMetadata extends IndependentTargetContent { schemaType: SchemaType; format: ApiPayloadFormat; csvOptions?: CsvOptions }
export type StatusType = 'DRAFT' | 'COMPLETED'
export type SchemaType = 'SOURCE_TO_MW_REQUEST' | 'MW_TO_DEST_REQUEST' | 'DEST_TO_MW_RESPONSE' | 'MW_TO_SOURCE_RESPONSE' | 'SOURCE_TO_DEST_REQUEST' | 'DEST_TO_SOURCE_RESPONSE'
export type EnvironmentName = 'DEV' | 'TEST' | 'PROD'
export type ConfigTarget = 'DESTINATION' | 'MIDDLEWARE'
export type AuthType = 'NONE' | 'BASIC_AUTH' | 'OAUTH2' | 'API_KEY'

export interface EnvironmentConfig {
  id?: number
  configTarget: ConfigTarget
  environmentType: EnvironmentName
  url: string
  timeoutMs?: number | null
  authType: AuthType
  credentialsConfigured: boolean
  retryCount?: number | null
  retryIntervalMs?: number | null
}
export interface ConfigRequest extends Omit<EnvironmentConfig, 'id' | 'credentialsConfigured'> {
  authCredentials?: Record<string, unknown>
}
export interface IntegrationDraftInput {
  serviceName: string
  description?: string
  sourceSystemId: number
  destinationSystemId: number
  middlewareSystemId?: number | null
  hasMiddleware: boolean
  syncType: SyncType
  formatSource: PayloadFormat
  formatDestination: PayloadFormat
}
export interface IntegrationRecord extends IntegrationDraftInput {
  id: string
  sourceSystem: string
  destinationSystem: string
  middleware?: string
  status: StatusType
  reviewRequired: boolean
  lastUpdated: string
  createdAt?: string
  updatedAt?: string | null
  environmentTypes: EnvironmentName[]
  environmentConfigs: EnvironmentConfig[]
}
export interface MappingSchema {
  id: number
  schemaType: SchemaType
  // Older API responses omit payload metadata and represent JSON objects.
  format?: ApiPayloadFormat
  schemaDefinition: Record<string, unknown>
  samplePayload?: Record<string, unknown> | null
  targetFormat?: ApiPayloadFormat | null
  targetSchemaDefinition?: Record<string, unknown> | null
  targetSamplePayload?: Record<string, unknown> | null
  targetRawContent?: string | null
  rawContent?: string | null
  mappingSupported?: boolean
  csvOptions?: CsvOptions | null
  fileName?: string | null
  contentType?: string | null
  fileSize?: number | null
  sampleDownloadUrl?: string | null
}
export interface FieldMapping {
  id: number
  sourceSchemaId: number
  sourceFieldPath: string
  targetSchemaId: number
  targetFieldPath: string
  isAiGenerated: boolean
  aiConfidenceScore: number | null
  origin?: 'MANUAL' | 'AI_ACCEPTED' | 'AI_EDITED'
  aiJobId?: string | null
  aiSuggestionId?: string | null
}
export interface IntegrationWorkspaceData {
  record: IntegrationRecord
  schemas: MappingSchema[]
  mappings: FieldMapping[]
}
export interface ManualMapping {
  id: string
  sourceField: string
  destinationField: string
}

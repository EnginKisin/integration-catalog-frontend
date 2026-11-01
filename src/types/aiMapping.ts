import type { MappingValue } from '../lib/mapping'
import type { ApiPayloadFormat, FieldMapping, MappingSchema } from './integration'

export interface MappingContext { contextRevision: string; schemas: MappingSchema[]; mappings: FieldMapping[] }
export interface AiCapabilities {
  enabled: boolean
  available: boolean
  provider: string
  model: string
  supportedFormats: ApiPayloadFormat[]
  maxFieldsPerSide: number
  code: string
}
export interface AiJobRequest {
  sourceSchemaId: number
  targetSchemaId: number
  expectedContextRevision: string
  protectedMappings: MappingValue[]
  options: { useSampleValues: boolean }
}
export interface AiJob {
  jobId: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  createdAt: string
  expiresAt: string
  errorCode?: string | null
  message?: string | null
  resultUrl?: string | null
  pollAfterMs: number | null
}
export interface AiSuggestion extends MappingValue { suggestionId: string; confidence: 'HIGH' | 'MEDIUM'; reason: string }
export interface UnmatchedField { fieldPath: string; code: string; reason: string }
export interface AiMappingResult {
  jobId: string
  contextRevision: string
  stale: boolean
  provider: string
  model: string
  suggestions: AiSuggestion[]
  unmatchedSourceFields: UnmatchedField[]
  unmatchedTargetFields: UnmatchedField[]
  warnings: string[]
}
export interface AppendMappingRequest {
  expectedContextRevision: string
  aiJobId?: string
  mappings: (MappingValue & { suggestionId?: string })[]
}
export interface AppendMappingResult { contextRevision: string; addedMappings: FieldMapping[] }

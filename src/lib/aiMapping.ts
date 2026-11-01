import { apiErrorMessages, errorText } from './apiErrors.ts'
import { ApiError } from '../services/api.ts'
import type { ApiPayloadFormat, FieldMapping, MappingSchema } from '../types/integration'
import type { AiSuggestion } from '../types/aiMapping'
import type { MappingDraft, MappingPair, MappingValue } from './mapping'
import { pairForMapping } from './mapping.ts'
import { schemaFormat } from './payload.ts'
import { studioSchemaTree } from './mappingStudio.ts'
import type { StudioField } from './mappingStudio'

export function canonicalFieldPath(path: string, format: ApiPayloadFormat): string {
  path = path.trim()
  if (format !== 'JSON' || path.startsWith('/')) return path
  const parts: string[] = []
  let cursor = 0
  for (const match of path.matchAll(/(?:^|\.)([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]|\[("(?:\\.|[^"\\])*")\]/g)) {
    if (match.index !== cursor) throw new Error('JSON alan yolunu kontrol edin. Örneğin /customer/id biçimini kullanın.')
    parts.push(match[1] ?? (match[2] !== undefined ? '*' : JSON.parse(match[3])))
    cursor += match[0].length
  }
  if (!parts.length || cursor !== path.length) throw new Error('JSON alan yolunu kontrol edin. Örneğin /customer/id biçimini kullanın.')
  return '/' + parts.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
}
export function canonicalMapping(value: MappingValue, pairs: MappingPair[]): MappingValue {
  const pair = pairForMapping(pairs, value)
  if (!pair?.source || !pair.target) throw new Error('Bağlantının şema çifti artık bulunamıyor. Örnekleri kontrol edin.')
  return { sourceSchemaId: value.sourceSchemaId, targetSchemaId: value.targetSchemaId, sourceFieldPath: canonicalFieldPath(value.sourceFieldPath, schemaFormat(pair.source)), targetFieldPath: canonicalFieldPath(value.targetFieldPath, schemaFormat(pair.target)) }
}
export function protectedDrafts(rows: MappingDraft[], saved: FieldMapping[], pair: MappingPair, pairs: MappingPair[]): MappingValue[] {
  return rows.filter((row) => row.sourceSchemaId === pair.source?.id && row.targetSchemaId === pair.target?.id && row.sourceFieldPath.trim() && row.targetFieldPath.trim() && !saved.some((item) => row.key === `saved-${item.id}` && item.sourceFieldPath === row.sourceFieldPath && item.targetFieldPath === row.targetFieldPath)).map((row) => canonicalMapping(row, pairs))
}
export function displayFieldPath(path: string, fields: StudioField[], format: ApiPayloadFormat): string {
  if (format !== 'JSON' || !path.startsWith('/')) return path
  return fields.find((field) => canonicalFieldPath(field.path, format) === path)?.path ?? path
}
export interface SuggestionDraft extends AiSuggestion { selected: boolean }
export function suggestionIssues(suggestions: SuggestionDraft[], rows: MappingValue[], pairs: MappingPair[]): string[] {
  const issues: string[] = []
  const targets = new Set<string>()
  const knownFields = new Map<MappingSchema, Set<string> | undefined>()
  for (const row of rows) {
    if (!row.targetFieldPath.trim() || !row.sourceFieldPath.trim() || !pairForMapping(pairs, row)) continue
    try { const value = canonicalMapping(row, pairs); targets.add(JSON.stringify([value.sourceSchemaId, value.targetSchemaId, value.targetFieldPath])) } catch { continue }
  }
  for (const suggestion of suggestions.filter((item) => item.selected)) {
    try {
      const value = canonicalMapping(suggestion, pairs)
      if (!value.sourceFieldPath || !value.targetFieldPath || value.sourceFieldPath.length > 500 || value.targetFieldPath.length > 500) throw new Error('Alan yolları boş olamaz ve en fazla 500 karakter olmalıdır.')
      const pair = pairForMapping(pairs, value)!
      for (const [schema, path, label] of [[pair.source!, value.sourceFieldPath, 'Kaynak'], [pair.target!, value.targetFieldPath, 'Hedef']] as const) {
        if (!knownFields.has(schema)) {
          const tree = studioSchemaTree(schema)
          knownFields.set(schema, tree.truncated ? undefined : new Set(tree.fields.filter((field) => !field.children.length).map((field) => canonicalFieldPath(field.path, schemaFormat(schema)))))
        }
        const paths = knownFields.get(schema)
        if (paths && !paths.has(path)) issues.push(`${label} alanı örnekte bulunamadı: ${path}`)
      }
      const key = JSON.stringify([value.sourceSchemaId, value.targetSchemaId, value.targetFieldPath])
      if (targets.has(key)) issues.push(`${value.targetFieldPath}: Bu hedef alan için zaten bir bağlantı var.`)
      targets.add(key)
    } catch (error) { issues.push((error as Error).message) }
  }
  return [...new Set(issues)]
}
export const aiErrorMessages = apiErrorMessages
export function aiJobErrorText(code?: string | null): string {
  return errorText(code && Object.hasOwn(apiErrorMessages, code) ? code : 'AI_INTERNAL_ERROR')
}
export function aiErrorText(error: unknown): string {
  const message = error instanceof ApiError && error.code ? errorText(error.code, error.params, error.status) : error instanceof Error ? error.message : aiErrorMessages.AI_INTERNAL_ERROR
  return error instanceof ApiError && error.requestId ? `${message} Destek için istek numarası: ${error.requestId}` : message
}

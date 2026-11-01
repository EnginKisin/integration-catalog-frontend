import type { FieldMapping, IntegrationRecord, MappingSchema, SchemaType } from '../types/integration'
import { schemaFormat, supportsMapping, targetSchema } from './payload.ts'

export interface MappingPair {
  key: string
  label: string
  sourceType: SchemaType
  targetType: SchemaType
  source?: MappingSchema
  target?: MappingSchema
}
export interface MappingValue {
  sourceSchemaId: number
  sourceFieldPath: string
  targetSchemaId: number
  targetFieldPath: string
}
export interface MappingDraft extends MappingValue { key: string }
export interface MappingRequest extends MappingValue { isAiGenerated: false; aiConfidenceScore: null }
export type FieldMode = 'auto' | 'schema' | 'sample'
export interface SchemaField { path: string; type: string; depth: number; repeated?: boolean; kind?: string; namespaceUri?: string; name?: string; sampleValue?: string }
export interface FieldTree { fields: SchemaField[]; warnings: string[]; truncated: boolean }

export function mappingPairs(record: Pick<IntegrationRecord, 'hasMiddleware'> & Partial<Pick<IntegrationRecord, 'sourceSystem' | 'destinationSystem' | 'middleware'>>, schemas: MappingSchema[]): MappingPair[] {
  const source = record.sourceSystem || 'Kaynak'
  const target = record.destinationSystem || 'Hedef'
  const middleware = record.middleware || 'Ara katman'
  const types: [SchemaType, SchemaType][] = record.hasMiddleware
    ? [['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST'], ['DEST_TO_MW_RESPONSE', 'MW_TO_SOURCE_RESPONSE']]
    : [['SOURCE_TO_DEST_REQUEST', 'SOURCE_TO_DEST_REQUEST'], ['DEST_TO_SOURCE_RESPONSE', 'DEST_TO_SOURCE_RESPONSE']]
  return types.map(([sourceType, targetType]) => ({
    key: `${sourceType}/${targetType}`, sourceType, targetType,
    label: record.hasMiddleware ? sourceType === 'SOURCE_TO_MW_REQUEST' ? `${source} → ${middleware} → ${target} (İstek)` : `${target} → ${middleware} → ${source} (Yanıt)` : sourceType === 'SOURCE_TO_DEST_REQUEST' ? `${source} → ${target} (İstek)` : `${target} → ${source} (Yanıt)`,
    source: schemas.find((schema) => schema.schemaType === sourceType),
    target: (() => { const schema = schemas.find((item) => item.schemaType === targetType); return !record.hasMiddleware && schema ? targetSchema(schema) ?? schema : schema })(),
  }))
}
export const pairSupportsMapping = (pair: MappingPair) => supportsMapping(pair.source) && supportsMapping(pair.target)
export const pairForMapping = (pairs: MappingPair[], mapping: MappingValue) => pairs.find((pair) => pair.source?.id === mapping.sourceSchemaId && pair.target?.id === mapping.targetSchemaId)
export const mappingDrafts = (mappings: FieldMapping[]): MappingDraft[] => mappings.map((item) => ({ key: `saved-${item.id}`, sourceSchemaId: item.sourceSchemaId, sourceFieldPath: item.sourceFieldPath, targetSchemaId: item.targetSchemaId, targetFieldPath: item.targetFieldPath }))
export function mappingIssues(record: Pick<IntegrationRecord, 'hasMiddleware'>, schemas: MappingSchema[], mappings: MappingValue[]): string[] {
  const pairs = mappingPairs(record, schemas)
  const seen = new Set<string>()
  const xmlPaths = new Map<MappingSchema, Set<string>>()
  const issues: string[] = []
  mappings.forEach((mapping, index) => {
    const label = `Eşleme ${index + 1}`
    const pair = pairForMapping(pairs, mapping)
    if (!Number.isSafeInteger(mapping.sourceSchemaId) || mapping.sourceSchemaId <= 0 || !Number.isSafeInteger(mapping.targetSchemaId) || mapping.targetSchemaId <= 0 || !pair) issues.push(`${label}: Şema çifti bu akışa ait değil veya şema bulunamadı.`)
    else if (!pairSupportsMapping(pair)) issues.push(`${label}: CSV/Excel veya eşleme desteği olmayan örneğe ait bağlantıyı kaldırın.`)
    else {
      for (const [schema, path, side] of [[pair.source!, mapping.sourceFieldPath, 'Kaynak'], [pair.target!, mapping.targetFieldPath, 'Hedef']] as const) {
        if (['XML', 'IDOC'].includes(schemaFormat(schema))) {
          if (!xmlPaths.has(schema)) xmlPaths.set(schema, xmlFieldPaths(schema.schemaDefinition))
          if (!xmlPaths.get(schema)!.has(path.trim())) issues.push(`${label}: ${side} alan yolu XML/IDOC ağacında bulunamadı.`)
        }
      }
    }
    if (!mapping.sourceFieldPath.trim() || mapping.sourceFieldPath.trim().length > 500) issues.push(`${label}: Kaynak alan yolu boş olamaz ve en fazla 500 karakter olmalıdır.`)
    if (!mapping.targetFieldPath.trim() || mapping.targetFieldPath.trim().length > 500) issues.push(`${label}: Hedef alan yolu boş olamaz ve en fazla 500 karakter olmalıdır.`)
    const key = JSON.stringify([mapping.sourceSchemaId, mapping.sourceFieldPath.trim(), mapping.targetSchemaId, mapping.targetFieldPath.trim()])
    if (seen.has(key)) issues.push(`${label}: Aynı bağlantı birden fazla kez eklenmiş.`)
    seen.add(key)
  })
  return issues
}
export function mappingCompletionIssues(record: Pick<IntegrationRecord, 'hasMiddleware' | 'syncType'>, schemas: MappingSchema[], mappings: MappingValue[]): string[] {
  return mappingIssues(record, schemas, mappings)
}
export function mappingRequests(record: Pick<IntegrationRecord, 'hasMiddleware'>, schemas: MappingSchema[], mappings: MappingValue[]): MappingRequest[] {
  const issues = mappingIssues(record, schemas, mappings)
  if (issues.length) throw new Error(issues.join('\n'))
  return mappings.map((mapping) => ({ sourceSchemaId: mapping.sourceSchemaId, sourceFieldPath: mapping.sourceFieldPath.trim(), targetSchemaId: mapping.targetSchemaId, targetFieldPath: mapping.targetFieldPath.trim(), isAiGenerated: false, aiConfidenceScore: null }))
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
// Preserve server field identities, including namespaces, attributes and repeated elements.
function xmlFields(definition: unknown): SchemaField[] {
  const fields: SchemaField[] = []
  const visit = (nodes: unknown, depth: number) => {
    if (!Array.isArray(nodes) || depth > 64) return
    for (const node of nodes) {
      if (fields.length >= 10000) return
      if (!object(node) || typeof node.path !== 'string') continue
      fields.push({ path: node.path, type: typeof node.type === 'string' ? node.type : 'unknown', depth, repeated: node.repeated === true, kind: typeof node.kind === 'string' ? node.kind : undefined, namespaceUri: typeof node.namespaceUri === 'string' ? node.namespaceUri : undefined, ...(typeof node.name === 'string' ? { name: node.name } : {}) })
      visit(node.children, depth + 1)
    }
  }
  if (object(definition)) visit(definition.fields, 0)
  return fields
}
const xmlFieldPaths = (definition: unknown) => new Set(xmlFields(definition).map((field) => field.path))
export function schemaFieldTree(schema?: MappingSchema, mode: FieldMode = 'auto', fieldLimit = 250): FieldTree {
  if (!schema || !supportsMapping(schema)) return { fields: [], warnings: [], truncated: false }
  if (['XML', 'IDOC'].includes(schemaFormat(schema))) {
    const fields = xmlFields(schema.schemaDefinition)
    return { fields: fields.slice(0, fieldLimit), warnings: fields.length > fieldLimit ? [`Alan ağacında ilk ${fieldLimit} yol gösteriliyor. Diğer geçerli yolları elle girebilirsiniz; mevcut eşlemeler korunur.`] : [], truncated: fields.length > fieldLimit }
  }
  const tree = extractFields(schema.schemaDefinition, mode, fieldLimit)
  if (schema.samplePayload) {
    const samples = new Map(extractFields(schema.samplePayload, 'sample', fieldLimit).fields.map((field) => [field.path, field.sampleValue]))
    tree.fields = tree.fields.map((field) => ({ ...field, sampleValue: field.sampleValue ?? samples.get(field.path) }))
  }
  return tree
}
function childPath(prefix: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? (prefix ? `${prefix}.${key}` : key) : `${prefix}[${JSON.stringify(key)}]`
}
function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value === 'object' ? 'object' : typeof value
}
// A bounded field picker, not a JSON Schema validator. Unsupported/dynamic paths remain editable by hand.
export function extractFields(definition: unknown, mode: FieldMode = 'auto', fieldLimit = 250): FieldTree {
  const fields = new Map<string, SchemaField>()
  const warnings = new Set<string>()
  let visited = 0
  let truncated = false
  const maxFields = Math.min(10000, Math.max(1, fieldLimit))
  const maxNodes = Math.max(2000, maxFields * 4)
  const maxDepth = 24
  const enter = (depth: number) => {
    if (++visited > maxNodes || depth > maxDepth || fields.size >= maxFields) { truncated = true; return false }
    return true
  }
  const add = (path: string, type: string, depth: number, sample?: unknown) => {
    if (!path) return
    const existing = fields.get(path)
    const types = new Set([...(existing?.type.split(' | ') ?? []), type])
    const sampleValue = existing?.sampleValue ?? (sample !== undefined && (sample === null || typeof sample !== 'object') ? String(sample) : undefined)
    fields.set(path, { path, type: [...types].join(' | '), depth: Math.max(0, depth - 1), ...(sampleValue !== undefined ? { sampleValue } : {}) })
  }
  const walkSample = (value: unknown, path: string, depth: number) => {
    if (!enter(depth)) return
    add(path, valueType(value), depth, value)
    if (Array.isArray(value)) {
      for (const child of value) { if (truncated) break; walkSample(child, `${path}[0]`, depth + 1) }
    } else if (object(value)) {
      for (const [key, child] of Object.entries(value)) { if (truncated) break; walkSample(child, childPath(path, key), depth + 1) }
    }
  }
  const walkSchema = (value: unknown, path: string, depth: number) => {
    if (!enter(depth)) return
    if (!object(value)) { add(path, 'unknown', depth); return }
    const type = Array.isArray(value.type) ? value.type.filter((item) => typeof item === 'string').join(' | ') || 'unknown' : typeof value.type === 'string' ? value.type : object(value.properties) ? 'object' : value.items ? 'array' : 'unknown'
    add(path, type, depth, Object.hasOwn(value, 'const') ? value.const : Object.hasOwn(value, 'default') ? value.default : Array.isArray(value.examples) ? value.examples[0] : undefined)
    if (value.$ref) warnings.add('$ref ile tanımlanan alanlar genişletilmedi. Gerekli yolları elle girebilirsiniz.')
    if (object(value.properties)) for (const [key, child] of Object.entries(value.properties)) { if (truncated) break; walkSchema(child, childPath(path, key), depth + 1) }
    const tuple = Array.isArray(value.prefixItems) ? value.prefixItems : Array.isArray(value.items) ? value.items : undefined
    if (tuple) {
      for (const [index, item] of tuple.entries()) { if (truncated) break; walkSchema(item, `${path}[${index}]`, depth + 1) }
    } else if (value.items !== undefined) walkSchema(value.items, `${path}[0]`, depth + 1)
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      const variants = value[key]
      if (!Array.isArray(variants)) continue
      warnings.add('Birleşik şemanın olası alanları birlikte gösteriliyor; seçtiğiniz yolun geçerliliğini kontrol edin.')
      for (const variant of variants) { if (truncated) break; walkSchema(variant, path, depth + 1) }
    }
    if (value.additionalProperties) warnings.add('Dinamik alan adları listelenemiyor; alan yolunu elle girebilirsiniz.')
  }
  const looksLikeSchema = object(definition) && (object(definition.properties) || typeof definition.type === 'string' || Array.isArray(definition.type) || '$ref' in definition || '$schema' in definition || 'items' in definition || ['allOf', 'oneOf', 'anyOf'].some((key) => key in definition))
  if (definition !== undefined) {
    if (mode === 'schema' || (mode === 'auto' && looksLikeSchema)) walkSchema(definition, '', 0)
    else walkSample(definition, '', 0)
  }
  if (truncated) warnings.add('Alan ağacı boyut sınırına ulaştı. Görünmeyen yolları elle girebilirsiniz; mevcut eşlemeler korunur.')
  return { fields: [...fields.values()], warnings: [...warnings], truncated }
}
export function fieldNotes(mapping: MappingValue, sourceFields: SchemaField[], targetFields: SchemaField[]): string[] {
  const source = sourceFields.find((field) => field.path === mapping.sourceFieldPath.trim())
  const target = targetFields.find((field) => field.path === mapping.targetFieldPath.trim())
  const notes: string[] = []
  if (mapping.sourceFieldPath.trim() && !source) notes.push('Kaynak yolu alan ağacında bulunamadı; elle girilen yolu kontrol edin.')
  if (mapping.targetFieldPath.trim() && !target) notes.push('Hedef yolu alan ağacında bulunamadı; elle girilen yolu kontrol edin.')
  if (source && target) {
    const types = (value: string) => value.split(' | ').map((type) => type === 'integer' ? 'number' : type)
    const sourceTypes = types(source.type)
    const targetTypes = types(target.type)
    if (!sourceTypes.includes('unknown') && !targetTypes.includes('unknown') && !sourceTypes.some((type) => targetTypes.includes(type))) notes.push(`Türler farklı görünüyor (${source.type} → ${target.type}); eşlemeyi gözden geçirin.`)
  }
  return notes
}

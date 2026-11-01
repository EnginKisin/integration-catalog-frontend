import type { ApiPayloadFormat, CsvOptions, IndependentTargetContent, IntegrationRecord, MappingSchema, SchemaContentRequest, SchemaType } from '../types/integration'

export const textPayloadLimit = 1024 * 1024
export const excelPayloadLimit = 5 * textPayloadLimit
export const defaultCsvOptions: CsvOptions = { delimiter: ',', hasHeader: true }
export const payloadExtensions: Record<ApiPayloadFormat, string> = {
  JSON: '.json', XML: '.xml', IDOC: '.xml,.idoc', CSV: '.csv', EXCEL: '.xls,.xlsx',
}
export const schemaFormat = (schema: MappingSchema): ApiPayloadFormat => schema.format ?? 'JSON'
export function expectedSchemaFormat(record: Pick<IntegrationRecord, 'formatSource' | 'formatDestination'>, type: SchemaType): ApiPayloadFormat {
  const source = ['SOURCE_TO_MW_REQUEST', 'MW_TO_SOURCE_RESPONSE', 'SOURCE_TO_DEST_REQUEST'].includes(type)
  return ((source ? record.formatSource : record.formatDestination) ?? 'json').toUpperCase() as ApiPayloadFormat
}
export function supportsMapping(schema?: MappingSchema): boolean {
  return Boolean(schema && !['CSV', 'EXCEL'].includes(schemaFormat(schema)) && schema.mappingSupported !== false)
}
export function schemaText(schema?: MappingSchema): string {
  if (!schema) return ''
  return schemaFormat(schema) === 'JSON' ? JSON.stringify(schema.schemaDefinition, null, 2) : schema.rawContent ?? ''
}
export function isDirectSchema(type: SchemaType): boolean { return type === 'SOURCE_TO_DEST_REQUEST' || type === 'DEST_TO_SOURCE_RESPONSE' }
export function expectedTargetFormat(record: Pick<IntegrationRecord, 'formatSource' | 'formatDestination'>, type: SchemaType): ApiPayloadFormat {
  return ((type === 'DEST_TO_SOURCE_RESPONSE' ? record.formatSource : record.formatDestination) ?? 'json').toUpperCase() as ApiPayloadFormat
}
export function hasIndependentTarget(schema?: MappingSchema): boolean {
  return Boolean(schema && (schema.targetRawContent?.trim() || Object.keys(schema.targetSchemaDefinition ?? {}).length || Object.keys(schema.targetSamplePayload ?? {}).length))
}
export function targetSchema(schema: MappingSchema): MappingSchema | undefined {
  if (!hasIndependentTarget(schema)) return undefined
  return { ...schema, format: schema.targetFormat ?? 'JSON', schemaDefinition: Object.keys(schema.targetSchemaDefinition ?? {}).length ? schema.targetSchemaDefinition! : schema.targetSamplePayload ?? {}, samplePayload: schema.targetSamplePayload, rawContent: schema.targetRawContent, fileName: undefined, fileSize: undefined, sampleDownloadUrl: undefined, mappingSupported: !['CSV', 'EXCEL'].includes(schema.targetFormat ?? 'JSON') }
}
export function targetText(schema?: MappingSchema): string {
  if (!schema || !hasIndependentTarget(schema)) return ''
  return schemaText(targetSchema(schema))
}
export function targetContent(format: ApiPayloadFormat, text: string): IndependentTargetContent {
  const content = contentRequest('SOURCE_TO_DEST_REQUEST', format, text)
  if (content.format === 'CSV') throw new Error('Hedef örneği JSON, XML veya IDOC olmalıdır.')
  if (content.format === 'JSON') {
    const definition = content.schemaDefinition
    const schema = Boolean(definition.properties || definition.$schema || definition.$ref || definition.items || ['object', 'array'].includes(String(definition.type)))
    return { targetFormat: 'JSON', ...(schema ? { targetSchemaDefinition: definition } : { targetSamplePayload: definition }) }
  }
  return { targetFormat: content.format, targetRawContent: content.rawContent }
}
export function formatFileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} bayt` : bytes < textPayloadLimit ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / textPayloadLimit).toFixed(1)} MiB`
}
export function validateSampleFile(file: Pick<File, 'name' | 'size'>, format: ApiPayloadFormat): void {
  if (!payloadExtensions[format].split(',').some((extension) => file.name.toLowerCase().endsWith(extension))) throw new Error(`${format} için ${payloadExtensions[format]} uzantılı dosya seçin.`)
  const limit = format === 'EXCEL' ? excelPayloadLimit : textPayloadLimit
  if (file.size === 0) throw new Error('Boş dosya yüklenemez.')
  if (file.size > limit) throw new Error(`${format} içeriği en fazla ${formatFileSize(limit)} olabilir.`)
}
export function validateCsvOptions(options: CsvOptions): CsvOptions {
  if (options.delimiter.length !== 1 || /[\r\n"]/.test(options.delimiter)) throw new Error('CSV ayırıcı tek karakter olmalıdır; satır sonu veya çift tırnak kullanılamaz.')
  return { delimiter: options.delimiter, hasHeader: options.hasHeader }
}
export function contentRequest(type: SchemaType, format: ApiPayloadFormat, text: string, csvOptions = defaultCsvOptions): SchemaContentRequest {
  if (format === 'EXCEL') throw new Error('Excel örneği için .xls veya .xlsx dosyası seçin.')
  if (new TextEncoder().encode(text).byteLength > textPayloadLimit) throw new Error('Metin içeriği en fazla 1 MiB olabilir.')
  if (format === 'JSON') {
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error('İçerik geçerli bir JSON nesnesi olmalıdır.') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('İçerik bir JSON nesnesi olmalıdır; dizi veya tek değer kabul edilmez.')
    return { schemaType: type, format, schemaDefinition: value as Record<string, unknown> }
  }
  if (!text.trim()) throw new Error(`${format} içeriği boş olamaz.`)
  return format === 'CSV'
    ? { schemaType: type, format, rawContent: text, csvOptions: validateCsvOptions(csvOptions) }
    : { schemaType: type, format, rawContent: text }
}

export function schemaContentIssue(record: Pick<IntegrationRecord, 'formatSource' | 'formatDestination'>, schema: MappingSchema): string | undefined {
  const format = schemaFormat(schema)
  const expected = expectedSchemaFormat(record, schema.schemaType)
  if (format !== expected) return `${format} olarak kayıtlı; ${expected} örneğini yeniden kaydedin.`
  const sourceIssue = storedContentIssue(schema)
  if (sourceIssue) return sourceIssue
  if (isDirectSchema(schema.schemaType) && !['CSV', 'EXCEL'].includes(format)) {
    const expectedTarget = expectedTargetFormat(record, schema.schemaType)
    if (!['CSV', 'EXCEL'].includes(expectedTarget)) {
      const target = targetSchema(schema)
      if (!target && format !== expectedTarget) return `Karma formatlı akış için ${expectedTarget} hedef örneğini ekleyin.`
      if (target && schemaFormat(target) !== expectedTarget) return `Hedef ${schemaFormat(target)} olarak kayıtlı; ${expectedTarget} hedef örneğini yeniden kaydedin.`
      if (target) { const issue = storedContentIssue(target); if (issue) return `Hedef örneği: ${issue}` }
    }
  }
  return undefined
}
function storedContentIssue(schema: MappingSchema): string | undefined {
  const format = schemaFormat(schema)
  if (format === 'JSON') return Object.keys(schema.schemaDefinition ?? {}).length ? undefined : 'Şema eksik veya boş.'
  if (format === 'CSV' || format === 'EXCEL') return schema.fileName && (schema.fileSize ?? 0) > 0 && schema.sampleDownloadUrl ? undefined : 'Geçerli örnek dosya eksik.'
  const tree = schema.schemaDefinition
  return schema.rawContent?.trim() && tree?.kind === (format === 'XML' ? 'xml' : 'idoc-xml') && Array.isArray(tree.fields) && tree.fields.length > 0 ? undefined : `${format} içeriği veya alan ağacı eksik.`
}

export const payloadErrorHints: Record<string, string> = {
  INVALID_JSON: 'JSON içeriğini kontrol edin; kök değer bir nesne olmalıdır.',
  INVALID_XML: 'XML içeriğini ve bildirilen satır/sütunu kontrol edin.',
  INVALID_IDOC: 'IDOC örneği, IDOC elemanı içeren XML olmalıdır.',
  INVALID_CSV: 'CSV ayırıcısını, başlıkları ve sütun sayılarını kontrol edin.',
  INVALID_EXCEL: 'Okunabilir ve şifresiz bir .xls veya .xlsx dosyası seçin.',
  INVALID_ENCODING: 'Metin dosyasını UTF-8 olarak kaydedip yeniden seçin.',
  PAYLOAD_TOO_LARGE: 'Metin dosyaları en fazla 1 MiB, Excel dosyaları en fazla 5 MiB olabilir.',
  FORMAT_MISMATCH: 'Örneğin formatı bu yöndeki kaynak/hedef seçimiyle eşleşmelidir.',
  MAPPING_NOT_SUPPORTED: 'CSV veya Excel içeren çiftlerde alan eşlemesi desteklenmez.',
  SCHEMA_MAPPING_CONFLICT: 'Yeni örnek mevcut alan eşlemelerini geçersiz kılıyor. Alan eşleme adımında ilgili bağlantıları kaldırıp kaydedin; ardından örneği yeniden kaydedin.',
}

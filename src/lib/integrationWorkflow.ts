import type { AuthType, ConfigRequest, EnvironmentConfig, FieldMapping, IntegrationRecord, MappingSchema, SchemaType } from '../types/integration'
import { mappingCompletionIssues, mappingPairs, pairSupportsMapping } from './mapping.ts'
import { hasIndependentTarget, schemaContentIssue } from './payload.ts'

export function schemaLabels(record: Pick<IntegrationRecord, 'sourceSystem' | 'destinationSystem' | 'middleware'>): Record<SchemaType, string> {
  const source = record.sourceSystem?.trim() || 'Kaynak'
  const destination = record.destinationSystem?.trim() || 'Hedef'
  const middleware = record.middleware?.trim() || 'Ara katman'
  return {
    SOURCE_TO_DEST_REQUEST: `${source} → ${destination} (İstek)`, DEST_TO_SOURCE_RESPONSE: `${destination} → ${source} (Yanıt)`,
    SOURCE_TO_MW_REQUEST: `${source} → ${middleware} (İstek)`, MW_TO_DEST_REQUEST: `${middleware} → ${destination} (İstek)`,
    DEST_TO_MW_RESPONSE: `${destination} → ${middleware} (Yanıt)`, MW_TO_SOURCE_RESPONSE: `${middleware} → ${source} (Yanıt)`,
  }
}
export function requiredSchemas(record: Pick<IntegrationRecord, 'hasMiddleware' | 'syncType'>): SchemaType[] {
  if (record.hasMiddleware) return record.syncType === 'sync'
    ? ['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST', 'DEST_TO_MW_RESPONSE', 'MW_TO_SOURCE_RESPONSE']
    : ['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST']
  return record.syncType === 'sync' ? ['SOURCE_TO_DEST_REQUEST', 'DEST_TO_SOURCE_RESPONSE'] : ['SOURCE_TO_DEST_REQUEST']
}
export function allowedSchemas(record: Pick<IntegrationRecord, 'hasMiddleware'>): SchemaType[] {
  return record.hasMiddleware
    ? ['SOURCE_TO_MW_REQUEST', 'MW_TO_DEST_REQUEST', 'DEST_TO_MW_RESPONSE', 'MW_TO_SOURCE_RESPONSE']
    : ['SOURCE_TO_DEST_REQUEST', 'DEST_TO_SOURCE_RESPONSE']
}
export function completionIssues(record: IntegrationRecord, schemas: MappingSchema[], mappings: FieldMapping[] = []): string[] {
  return [...(record.reviewRequired ? ['Teknik değişikliklerin inceleme onayı bekleniyor.'] : []), ...environmentIssues(record), ...schemaIssues(record, schemas), ...mappingCompletionIssues(record, schemas, mappings)]
}
export function environmentIssues(record: IntegrationRecord): string[] {
  const issues: string[] = []
  const configs = record.environmentConfigs
  if (!configs.length) issues.push('En az bir ortam ayarı kaydedin.')
  for (const environment of new Set(configs.map((item) => item.environmentType))) {
    if (!configs.some((item) => item.environmentType === environment && item.configTarget === 'DESTINATION')) issues.push(`${environment} ortamında hedef ayarı eksik.`)
    if (record.hasMiddleware && !configs.some((item) => item.environmentType === environment && item.configTarget === 'MIDDLEWARE')) issues.push(`${environment} ortamında ara katman ayarı eksik.`)
  }
  if (!record.hasMiddleware && configs.some((item) => item.configTarget === 'MIDDLEWARE')) issues.push('Doğrudan akışta kalan ara katman ayarlarını gözden geçirin.')
  return issues
}
export function schemaIssues(record: IntegrationRecord, schemas: MappingSchema[]): string[] {
  const issues: string[] = []
  const labels = schemaLabels(record)
  for (const type of requiredSchemas(record)) {
    const schema = schemas.find((item) => item.schemaType === type)
    if (!schema) issues.push(`${labels[type]} şeması eksik veya boş.`)
  }
  for (const schema of schemas.filter((item) => allowedSchemas(record).includes(item.schemaType))) {
    const issue = schemaContentIssue(record, schema)
    if (issue) issues.push(`${labels[schema.schemaType]}: ${issue}`)
  }
  if (schemas.some((item) => !allowedSchemas(record).includes(item.schemaType))) issues.push('Önceki akışa ait uyumsuz şemalar var. Önceki akışı seçin veya yeni bir entegrasyon oluşturun; inceleme onayı bu engeli kaldırmaz.')
  return issues
}
export type SaveIntent = 'stay' | 'next' | 'exit'
export type WorkspaceMutation = (action: () => Promise<unknown>, success: string, intent?: SaveIntent, options?: { refreshOnError?: boolean; preserveDraft?: boolean; preserveDirty?: boolean }) => Promise<boolean>
export type IntegrationStepId = 'basics' | 'configs' | 'schemas' | 'mappings' | 'review'
export interface IntegrationStep { id: IntegrationStepId; label: string; detail: string; issues: string[] }
export function integrationSteps(record: IntegrationRecord, schemas: MappingSchema[], mappings: FieldMapping[] = []): IntegrationStep[] {
  const required = requiredSchemas(record)
  const savedCount = required.filter((type) => schemas.some((item) => item.schemaType === type && !schemaContentIssue(record, item))).length
  const showMapping = record.hasMiddleware
    ? mappings.length > 0 || mappingPairs(record, schemas).some(pairSupportsMapping)
    : mappingPairs(record, schemas).some((pair) => pairSupportsMapping(pair) && hasIndependentTarget(pair.source))
  return [
    { id: 'basics' as const, label: 'Temel bilgiler', detail: 'Sistemler ve akış', issues: [] },
    { id: 'configs' as const, label: 'Ortam ayarları', detail: `${new Set(record.environmentConfigs.map((item) => item.environmentType)).size} ortam kayıtlı`, issues: environmentIssues(record) },
    { id: 'schemas' as const, label: 'İstek ve yanıt', detail: `${savedCount}/${required.length} zorunlu yapı kayıtlı`, issues: schemaIssues(record, schemas) },
    ...(showMapping ? [{ id: 'mappings' as const, label: 'Alan eşleme', detail: `${mappings.length} eşleme · İsteğe bağlı`, issues: mappingCompletionIssues(record, schemas, mappings) }] : []),
    { id: 'review' as const, label: 'Özet ve tamamlama', detail: record.status === 'COMPLETED' ? 'Katalog kaydı tamamlandı' : 'Son kontrol', issues: [...(record.reviewRequired ? ['Teknik değişikliklerin inceleme onayı bekleniyor.'] : []), ...(!showMapping ? mappingCompletionIssues(record, schemas, mappings) : [])] },
  ]
}
export function resumeStep(record: IntegrationRecord, schemas: MappingSchema[], mappings: FieldMapping[] = []): IntegrationStepId {
  if (record.status === 'COMPLETED') return 'basics'
  return integrationSteps(record, schemas, mappings).find((step) => step.issues.length > 0)?.id ?? 'review'
}
export function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error(`${label} geçerli bir JSON nesnesi olmalıdır.`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} bir JSON nesnesi olmalıdır; dizi veya tek değer kabul edilmez.`)
  return value as Record<string, unknown>
}
export interface ConfigDraft {
  key: string
  configTarget: EnvironmentConfig['configTarget']
  environmentType: EnvironmentConfig['environmentType']
  url: string
  authType: AuthType
  timeoutMs: string
  retryCount: string
  retryIntervalMs: string
  credentialsText: string
}
export const configKey = (item: Pick<EnvironmentConfig, 'environmentType' | 'configTarget'>) => `${item.environmentType}/${item.configTarget}`
export function configDrafts(configs: EnvironmentConfig[]): ConfigDraft[] {
  return configs.map((item) => ({ key: configKey(item), configTarget: item.configTarget, environmentType: item.environmentType, url: item.url,
    authType: item.authType, timeoutMs: item.timeoutMs == null ? '' : String(item.timeoutMs), retryCount: item.retryCount == null ? '' : String(item.retryCount),
    retryIntervalMs: item.retryIntervalMs == null ? '' : String(item.retryIntervalMs), credentialsText: '',
  }))
}
function numeric(value: string, label: string, min: number): number | undefined {
  if (!value.trim()) return undefined
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min) throw new Error(`${label} en az ${min} olan bir tam sayı olmalıdır.`)
  return number
}
export function configRequests(rows: ConfigDraft[], original: EnvironmentConfig[], hasMiddleware: boolean, manageCredentials: boolean): ConfigRequest[] {
  const seen = new Set<string>()
  const requests = rows.map((row) => {
    const key = configKey(row)
    if (seen.has(key)) throw new Error(`${key} birden fazla kez tanımlanamaz.`)
    seen.add(key)
    if (!['DEV', 'TEST', 'PROD'].includes(row.environmentType) || !['DESTINATION', 'MIDDLEWARE'].includes(row.configTarget) || !['NONE', 'BASIC_AUTH', 'OAUTH2', 'API_KEY'].includes(row.authType)) throw new Error('Geçersiz ortam, hedef veya kimlik doğrulama türü.')
    if (!hasMiddleware && row.configTarget === 'MIDDLEWARE') throw new Error('Doğrudan akışta ara katman ayarı kaydedilemez. Korunan ara katman satırlarını gözden geçirin.')
    if (!row.url.trim() || row.url.trim().length > 100) throw new Error(`${key} URL alanı boş olamaz ve en fazla 100 karakter olmalıdır.`)
    const previous = original.find((item) => configKey(item) === key)
    const credentialsText = row.credentialsText.trim()
    if (!manageCredentials && (credentialsText || row.authType !== (previous?.authType ?? 'NONE'))) throw new Error('Erişim bilgisi veya kimlik doğrulama türünü değiştirme izniniz yok.')
    let credentials: Record<string, unknown> | undefined
    if (credentialsText) {
      if (row.authType === 'NONE') throw new Error('Kimlik doğrulama yokken erişim bilgisi gönderilemez.')
      credentials = parseJsonObject(credentialsText, `${key} erişim bilgisi`)
      if (!Object.keys(credentials).length) throw new Error('Boş erişim bilgisi kaydedilemez. Temizlemek için kimlik doğrulamayı NONE seçin.')
    }
    if (row.authType !== 'NONE' && !credentials && !(previous?.authType === row.authType && previous.credentialsConfigured)) throw new Error(`${key} için yeni erişim bilgisi girin.`)
    return {
      configTarget: row.configTarget, environmentType: row.environmentType, url: row.url.trim(), authType: row.authType,
      timeoutMs: numeric(row.timeoutMs, `${key} timeout`, 1), retryCount: numeric(row.retryCount, `${key} yeniden deneme`, 0), retryIntervalMs: numeric(row.retryIntervalMs, `${key} deneme aralığı`, 0),
      ...(credentials ? { authCredentials: credentials } : {}),
    }
  })
  if (!manageCredentials && original.some((item) => item.credentialsConfigured && !seen.has(configKey(item)))) throw new Error('Erişim bilgisi içeren bir ortamı kaldırmak için değiştirme izni gerekir.')
  return requests
}

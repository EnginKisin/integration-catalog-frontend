import type { IntegrationRecord } from '../types/integration'

export interface FlowFilters {
  source: string
  destination: string
  middleware: string
  integration: string
  environment: string
  sync: string
  status: string
  query: string
}

export const emptyFlowFilters: FlowFilters = { source: '', destination: '', middleware: '', integration: '', environment: '', sync: '', status: '', query: '' }
export { FLOW_WIDTH, flowHeight, flowMapSvg, flowReportHeight, layoutFlows, flowComponents } from "./flowGraph.ts"

export function filterFlows(records: IntegrationRecord[], filters: FlowFilters): IntegrationRecord[] {
  const query = filters.query.trim().toLocaleLowerCase('tr-TR')
  return records.filter((record) =>
    (!filters.source || String(record.sourceSystemId) === filters.source) &&
    (!filters.destination || String(record.destinationSystemId) === filters.destination) &&
    (!filters.middleware || (filters.middleware === 'none' ? !record.hasMiddleware : record.hasMiddleware && String(record.middlewareSystemId) === filters.middleware)) &&
    (!filters.integration || record.id === filters.integration) &&
    (!filters.environment || record.environmentTypes.some((environment) => environment === filters.environment)) &&
    (!filters.sync || record.syncType === filters.sync) &&
    (!filters.status || record.status === filters.status) &&
    (!query || [record.id, record.serviceName, record.description, record.sourceSystem, record.destinationSystem, record.hasMiddleware ? record.middleware : ''].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(query)),
  ).sort((a, b) => a.serviceName.localeCompare(b.serviceName, 'tr') || a.id.localeCompare(b.id, 'en', { numeric: true }))
}

export function flowSystems(records: IntegrationRecord[], role: 'source' | 'destination' | 'middleware') {
  const systems = new Map<number, string>()
  for (const record of records) {
    const [id, name] = role === 'source' ? [record.sourceSystemId, record.sourceSystem] : role === 'destination' ? [record.destinationSystemId, record.destinationSystem] : record.hasMiddleware ? [record.middlewareSystemId, record.middleware] : [null, null]
    if (id != null) systems.set(id, name || `#${id}`)
  }
  return [...systems].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id - b.id)
}

export function flowSystemCount(records: IntegrationRecord[]) {
  return new Set(records.flatMap((record) => [record.sourceSystemId, record.destinationSystemId, ...(record.hasMiddleware && record.middlewareSystemId != null ? [record.middlewareSystemId] : [])])).size
}

export function flowFilterSummary(records: IntegrationRecord[], filters: FlowFilters): string {
  const parts: string[] = []
  for (const [field, role, label] of [['source', 'source', 'Kaynak'], ['destination', 'destination', 'Hedef'], ['middleware', 'middleware', 'Ara katman']] as const) {
    if (filters[field]) parts.push(`${label}: ${filters[field] === 'none' ? 'Yok' : flowSystems(records, role).find((system) => String(system.id) === filters[field])?.name ?? `#${filters[field]}`}`)
  }
  if (filters.integration) parts.push(`Entegrasyon: ${records.find((record) => record.id === filters.integration)?.serviceName ?? `#${filters.integration}`}`)
  if (filters.environment) parts.push(`Ortam: ${filters.environment}`)
  if (filters.sync) parts.push(filters.sync === 'sync' ? 'Senkron' : 'Asenkron')
  if (filters.status) parts.push(filters.status === 'DRAFT' ? 'Taslak' : 'Tamamlandı')
  if (filters.query.trim()) parts.push(`Arama: ${filters.query.trim()}`)
  return parts.join(' · ') || 'Tüm entegrasyonlar'
}


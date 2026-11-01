import type { IntegrationRecord } from '../types/integration'

export const FLOW_WIDTH = 1000
type NodeRole = 'source' | 'middleware' | 'destination'
export interface FlowNode {
  key: string
  role: NodeRole
  id: number | null | undefined
  name: string
  records: IntegrationRecord[]
  x: number
  y: number
  width: number
  height: number
}
interface FlowRoute {
  record: IntegrationRecord
  color: string
  path: string
  labelX: number
  labelY: number
  sourceY: number
  targetY: number
  middlewareY?: number
}

const colors = ['#bda0f2', '#6ed4b5', '#7cb4ff', '#e5ba76', '#e6a0bc', '#75c9d4']
const nodeKey = (record: IntegrationRecord, role: NodeRole) => {
  const id = role === 'source' ? record.sourceSystemId : role === 'destination' ? record.destinationSystemId : record.middlewareSystemId
  return `${role}:${id ?? `unknown-${record.id}`}`
}

export function layoutFlows(records: IntegrationRecord[]) {
  const nodes = new Map<string, FlowNode>()
  for (const record of records) {
    for (const role of ['source', ...(record.hasMiddleware ? ['middleware'] as const : []), 'destination'] as const) {
      const key = nodeKey(record, role)
      let node = nodes.get(key)
      if (!node) {
        const id = role === 'source' ? record.sourceSystemId : role === 'destination' ? record.destinationSystemId : record.middlewareSystemId
        node = { key, role, id, name: role === 'source' ? record.sourceSystem : role === 'destination' ? record.destinationSystem : record.middleware || 'Ara katman', records: [], x: role === 'source' ? 24 : role === 'middleware' ? 370 : 756, y: 0, width: role === 'middleware' ? 260 : 220, height: 0 }
        nodes.set(key, node)
      }
      node.records.push(record)
    }
  }
  const columns = (['source', 'middleware', 'destination'] as const).map((role) => [...nodes.values()].filter((node) => node.role === role))
  const order = new Map<string, number>()
  let rank = 0
  for (const hub of columns[1]) for (const record of hub.records) order.set(record.id, rank++)
  const direct = records.filter((record) => !record.hasMiddleware)
  for (const record of direct) order.set(record.id, rank++)
  for (const column of columns) {
    column.forEach((node) => {
      node.records.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      node.height = node.role === 'middleware' ? Math.max(180, 104 + node.records.length * 44) : Math.max(110, 66 + node.records.length * 34)
    })
    const averageRank = (node: FlowNode) => node.records.reduce((sum, record) => sum + order.get(record.id)!, 0) / node.records.length
    column.sort((a, b) => averageRank(a) - averageRank(b) || a.key.localeCompare(b.key))
  }
  const columnHeight = (column: FlowNode[]) => column.reduce((sum, node) => sum + node.height, 0) + Math.max(0, column.length - 1) * 32
  const contentHeight = Math.max(180, ...columns.map(columnHeight), columns[1].length ? 0 : direct.length * 48 + 40)
  for (const column of columns) {
    let top = 70 + (contentHeight - columnHeight(column)) / 2
    for (const node of column) { node.y = top; top += node.height + 32 }
  }
  const port = (node: FlowNode, id: string) => {
    const index = node.records.findIndex((record) => record.id === id)
    const header = node.role === 'middleware' ? 88 : 64
    return node.y + header + (index + 0.5) * (node.height - header - 22) / node.records.length
  }
  const routes: FlowRoute[] = records.map((record, index) => {
    const source = nodes.get(nodeKey(record, 'source'))!
    const target = nodes.get(nodeKey(record, 'destination'))!
    const sourceY = port(source, record.id)
    const targetY = port(target, record.id)
    const hub = record.hasMiddleware ? nodes.get(nodeKey(record, 'middleware')) : undefined
    const middlewareY = hub ? port(hub, record.id) : undefined
    const laneY = hub ? middlewareY! : columns[1].length ? 70 + contentHeight + 40 + direct.indexOf(record) * 48 : 90 + (direct.indexOf(record) + 0.5) * (contentHeight - 40) / direct.length
    const path = hub
      ? `M244 ${sourceY} C307 ${sourceY} 307 ${laneY} 370 ${laneY} H630 C693 ${laneY} 693 ${targetY} 756 ${targetY}`
      : `M244 ${sourceY} C300 ${sourceY} 300 ${laneY} 340 ${laneY} H660 C700 ${laneY} 700 ${targetY} 756 ${targetY}`
    return { record, color: colors[index % colors.length], path, labelX: 500, labelY: laneY, sourceY, targetY, middlewareY }
  })
  return { nodes: [...nodes.values()], routes, height: 70 + contentHeight + (columns[1].length && direct.length ? 48 * direct.length + 24 : 0) + 40 }
}

export const flowHeight = (records: IntegrationRecord[]) => layoutFlows(records).height

export function flowComponents(records: IntegrationRecord[]): IntegrationRecord[][] {
  const parents = records.map((_, index) => index)
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]))
  const owner = new Map<string, number>()
  records.forEach((record, index) => {
    for (const role of ['source', ...(record.hasMiddleware ? ['middleware'] as const : []), 'destination'] as const) {
      const key = nodeKey(record, role)
      const previous = owner.get(key)
      if (previous !== undefined) parents[root(index)] = root(previous)
      else owner.set(key, index)
    }
  })
  const groups = new Map<number, IntegrationRecord[]>()
  records.forEach((record, index) => { const id = root(index); const group = groups.get(id) ?? []; group.push(record); groups.set(id, group) })
  return [...groups.values()]
}

const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
const shorten = (value: string, length: number) => Array.from(value).length > length ? Array.from(value).slice(0, length - 1).join('') + '…' : value
const reportLines = (summary: string) => Array.from({ length: Math.max(1, Math.ceil(Array.from(summary).length / 120)) }, (_, index) => Array.from(summary).slice(index * 120, (index + 1) * 120).join(''))
export const flowReportHeight = (summary: string) => 100 + reportLines(summary).length * 18
const text = (x: number, y: number, value: string, fill = '#bdcadc', size = 12, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${xml(value)}</text>`

function systemNode(node: FlowNode, selected?: IntegrationRecord) {
  const color = node.role === 'source' ? '#7cb4ff' : node.role === 'middleware' ? '#bda0f2' : '#6ed4b5'
  const label = node.role === 'source' ? 'Kaynak' : node.role === 'middleware' ? 'Ara katman' : 'Hedef'
  const active = selected && node.records.some((record) => record.id === selected.id)
  const { x, y, width, height } = node
  return `<g data-system-role="${node.role}" data-system-id="${xml(node.id ?? node.key)}"><title>${xml(`${label}: ${node.name} · ${node.records.length} entegrasyon`)}</title>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${node.role === 'middleware' ? '#1b1830' : '#151e2c'}" stroke="${active ? color : '#344058'}" stroke-width="${active ? 1.5 : 1}"/>
    <rect x="${x}" y="${y + 20}" width="3" height="38" rx="1.5" fill="${color}"/>
    ${node.role === 'middleware' ? text(x + 18, y + 24, 'ARA KATMAN', color, 9, 'letter-spacing="1.2"') : ''}
    ${text(x + 18, y + (node.role === 'middleware' ? 47 : 29), shorten(node.name, node.role === 'middleware' ? 26 : 23), '#e6ecf6', node.role === 'middleware' ? 17 : 14, 'font-weight="600"')}
    ${text(x + 18, y + (node.role === 'middleware' ? 68 : 49), `${node.records.length} entegrasyon`, '#91a0b8', 10)}
    ${node.role === 'middleware' ? `<line x1="${x + 18}" y1="${y + 80}" x2="${x + width - 18}" y2="${y + 80}" stroke="#bda0f22b"/>` : ''}
  </g>`
}

interface SvgOptions { selectedId?: string; interactive?: boolean; report?: { summary: string; date: string; page?: string } }
export function flowMapSvg(records: IntegrationRecord[], options: SvgOptions = {}): string {
  const layout = layoutFlows(records)
  const report = options.report
  const reportHeight = report ? flowReportHeight(report.summary) : 0
  const selected = records.find((record) => record.id === options.selectedId)
  const header = report ? `${text(28, 35, 'Akış · Entegrasyon Haritası', '#f0f2f8', 22, 'font-weight="600"')}
    ${text(28, 59, `${records.length} entegrasyon · ${report.date}${report.page ? ` · ${report.page}` : ''}`, '#91a0b8', 11)}
    ${reportLines(report.summary).map((line, index) => text(28, 82 + index * 18, line, '#bdcadc', 11)).join('')}
    <line x1="28" y1="${reportHeight - 12}" x2="972" y2="${reportHeight - 12}" stroke="#293143"/>` : ''
  const routeMarkup = [...layout.routes].sort((a, b) => Number(a.record.id === selected?.id) - Number(b.record.id === selected?.id)).map((route) => {
    const { record, color, labelX, labelY } = route
    const active = selected?.id === record.id
    const interactive = options.interactive ? `data-flow-id="${xml(record.id)}" role="button" tabindex="0" aria-pressed="${active}" aria-label="${xml(`${record.serviceName} akışını seç`)}"` : ''
    const arrow = (x: number, y: number) => `<path d="m${x - 8} ${y - 5} 7 5-7 5" stroke="${color}" stroke-width="${active ? 2.5 : 1.8}" fill="none"/>`
    const label = `${record.sourceSystem}${record.hasMiddleware ? ` → ${record.middleware || 'Ara katman'}` : ''} → ${record.destinationSystem}`
    return `<g ${interactive} opacity="${selected && !active ? 0.55 : 1}"><title>${xml(`${record.serviceName} · ${label}`)}</title>
      <path class="flow-route-path" d="${route.path}" stroke="${color}" stroke-width="${active ? 3 : 1.6}" fill="none"/>
      ${options.interactive ? `<path d="${route.path}" stroke="transparent" stroke-width="16" fill="none" pointer-events="stroke"/>` : ''}
      ${route.middlewareY !== undefined ? arrow(370, route.middlewareY) : ''}${arrow(756, route.targetY)}
      <circle cx="244" cy="${route.sourceY}" r="3.5" fill="${color}"/><circle cx="756" cy="${route.targetY}" r="3.5" fill="${color}"/>
      <rect class="flow-route-label" x="${labelX - 116}" y="${labelY - 14}" width="232" height="28" rx="6" fill="${active ? '#302941' : '#171c2a'}" stroke="${active ? color : '#3b3b50'}"/>
      ${text(labelX, labelY + 4, shorten(record.serviceName, 30), active ? '#f0e7ff' : '#c0cadd', 11, 'text-anchor="middle"')}
      ${!record.hasMiddleware ? text(labelX, labelY + 28, 'Doğrudan bağlantı', '#819b96', 9, 'text-anchor="middle"') : ''}
    </g>`
  }).join('')
  const height = layout.height + reportHeight
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FLOW_WIDTH}" height="${height}" viewBox="0 0 ${FLOW_WIDTH} ${height}" role="group" aria-label="Entegrasyon akış çizimi" font-family="Arial, sans-serif">
    <title>Entegrasyon akış haritası</title><desc>${xml(report?.summary ?? 'Aynı sistem her rolde bir kez gösterilir. Ortak ara katmanlardan geçen renkli bağlantılar ayrı entegrasyonları temsil eder.')}</desc>
    <rect width="100%" height="100%" fill="#0c121c"/>${header}<g transform="translate(0 ${reportHeight})">
    ${text(24, 29, 'KAYNAK SİSTEMLER', '#8191aa', 9, 'letter-spacing="1.4"')}
    ${text(500, 29, 'ORTAK BAĞLANTI NOKTALARI', '#8191aa', 9, 'letter-spacing="1.4" text-anchor="middle"')}
    ${text(976, 29, 'HEDEF SİSTEMLER', '#8191aa', 9, 'letter-spacing="1.4" text-anchor="end"')}
    ${layout.nodes.map((node) => systemNode(node, selected)).join('')}${routeMarkup}</g></svg>`
}

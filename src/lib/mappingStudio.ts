import { schemaFieldTree } from './mapping.ts'
import type { FieldMode, SchemaField } from './mapping'
import { schemaFormat } from './payload.ts'
import type { FieldMapping, MappingSchema } from '../types/integration'

export interface StudioField {
  path: string
  name: string
  type: string
  value?: string
  depth: number
  parent?: string
  children: string[]
  repeated?: boolean
}
export interface StudioLink {
  id: string
  source: string
  target: string
  pairKey: string
  pairLabel: string
  notes: string[]
  origin?: FieldMapping['origin']
}
export interface StudioPairOption { key: string; label: string; disabled: boolean }
export interface StudioPaneData { name: string; caption: string; fileName: string; format: string; fields: StudioField[] }

function fieldName(field: SchemaField) {
  if (field.name) return field.name
  if (field.path.startsWith('/')) {
    let braceDepth = 0
    let lastSlash = 0
    for (let index = 0; index < field.path.length; index++) {
      const char = field.path[index]
      if (char === '{') braceDepth++
      else if (char === '}') braceDepth--
      else if (char === '/' && braceDepth === 0) lastSlash = index
    }
    return field.path.slice(lastSlash + 1)
  }
  const parts = [...field.path.matchAll(/(?:^|\.)([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]|\[("(?:\\.|[^"\\])*")\]/g)]
  const part = parts.at(-1)
  if (!part) return field.path
  return part[1] ?? (part[2] !== undefined ? `[${part[2]}]` : JSON.parse(part[3]) || '""')
}

function xmlValues(schema?: MappingSchema): Map<string, string> {
  const values = new Map<string, string>()
  if (!schema?.rawContent || !['XML', 'IDOC'].includes(schemaFormat(schema)) || typeof DOMParser === 'undefined') return values
  const document = new DOMParser().parseFromString(schema.rawContent, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) return values
  let visited = 0
  const expandedName = (node: Element | Attr) => node.namespaceURI ? `{${node.namespaceURI}}${node.localName}` : node.localName
  const visit = (element: Element, parent: string, depth: number) => {
    if (++visited > 10000 || depth > 64) return
    const path = `${parent}/${expandedName(element)}`
    if (!element.children.length && !values.has(path)) values.set(path, element.textContent?.trim().slice(0, 500) ?? '')
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue
      const attributePath = `${path}/@${expandedName(attribute)}`
      if (!values.has(attributePath)) values.set(attributePath, attribute.value.slice(0, 500))
    }
    for (const child of Array.from(element.children)) visit(child, path, depth + 1)
  }
  if (document.documentElement) visit(document.documentElement, '', 0)
  return values
}

export function studioSchemaTree(schema?: MappingSchema, mode: FieldMode = 'auto') {
  const tree = schemaFieldTree(schema, mode, 10000)
  const values = xmlValues(schema)
  const nodes = new Map<string, StudioField>(tree.fields.map((field) => [field.path, { path: field.path, name: fieldName(field), type: field.type, value: field.sampleValue ?? values.get(field.path), depth: field.depth, children: [], repeated: field.repeated }]))
  const roots: StudioField[] = []
  for (const row of nodes.values()) {
    const separators: number[] = []
    if (row.path.startsWith('/')) {
      let braces = 0
      for (let index = 1; index < row.path.length; index++) {
        const char = row.path[index]
        if (char === '{') braces++
        else if (char === '}') braces--
        else if (char === '/' && !braces) separators.push(index)
      }
    } else {
      for (const token of row.path.matchAll(/(?:^|\.)([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]|\[("(?:\\.|[^"\\])*")\]/g)) if (token.index > 0) separators.push(token.index)
    }
    const parent = separators.reverse().map((index) => nodes.get(row.path.slice(0, index))).find(Boolean)
    if (parent) { row.parent = parent.path; parent.children.push(row.path) }
    else roots.push(row)
  }
  const fields: StudioField[] = []
  const visit = (row: StudioField, depth: number) => { row.depth = depth; fields.push(row); for (const path of row.children) visit(nodes.get(path)!, depth + 1) }
  for (const root of roots) visit(root, 0)
  return { ...tree, fields }
}

export function defaultExpanded(fields: StudioField[]) {
  return new Set(fields.filter((field) => field.children.length && field.depth < 2).map((field) => field.path))
}

export function visibleStudioFields(fields: StudioField[], expanded: Set<string>, query: string, linked: Set<string>, onlyUnmapped: boolean) {
  const needle = query.trim().toLocaleLowerCase('tr-TR')
  const byPath = new Map(fields.map((field) => [field.path, field]))
  const matching = new Set<string>()
  if (needle || onlyUnmapped) {
    for (const field of fields) {
      if (onlyUnmapped && linked.has(field.path)) continue
      if (needle && !`${field.path} ${field.name} ${field.value ?? ''} ${field.type}`.toLocaleLowerCase('tr-TR').includes(needle)) continue
      if (field.children.length) continue
      matching.add(field.path)
      let parent = field.parent
      while (parent) { matching.add(parent); parent = byPath.get(parent)?.parent }
    }
    return fields.filter((field) => matching.has(field.path))
  }
  return fields.filter((field) => {
    let parent = field.parent
    while (parent) {
      if (!expanded.has(parent)) return false
      parent = byPath.get(parent)?.parent
    }
    return true
  })
}

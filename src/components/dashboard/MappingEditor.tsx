import { useMemo, useReducer, useState } from 'react'
import type { WorkspaceMutation } from '../../lib/integrationWorkflow'
import { fieldNotes, mappingDrafts, mappingIssues, mappingPairs, mappingRequests, pairForMapping, pairSupportsMapping } from '../../lib/mapping'
import { studioSchemaTree } from '../../lib/mappingStudio'
import type { StudioLink } from '../../lib/mappingStudio'
import { schemaFormat } from '../../lib/payload'
import type { MappingDraft } from '../../lib/mapping'
import { saveMappings } from '../../services/integrationsBackend'
import type { FieldMapping, IntegrationRecord, MappingSchema } from '../../types/integration'
import { MappingStudio } from './mapping-studio/MappingStudio'
import { SaveActions } from './SaveActions'
import { saveIntent } from '../../lib/form'
import { displayFieldPath } from '../../lib/aiMapping'
import { appendMappings } from '../../services/aiMappingBackend'
import { AiMappingAssistant } from './AiMappingAssistant'

interface Props {
  record: IntegrationRecord
  schemas: MappingSchema[]
  mappings: FieldMapping[]
  busy: boolean
  saving: boolean
  dirty: boolean
  readOnly: boolean
  onDirty: () => void
  mutate: WorkspaceMutation
  onBack: () => void
}
interface History { past: MappingDraft[][]; current: MappingDraft[]; future: MappingDraft[][] }
type HistoryAction = { type: 'change' | 'appendSaved'; rows: MappingDraft[] } | { type: 'undo' | 'redo' }
function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'appendSaved') {
    const append = (rows: MappingDraft[]) => [...rows, ...action.rows.filter((item) => !rows.some((row) => row.key === item.key))]
    return { past: state.past.map(append), current: append(state.current), future: state.future.map(append) }
  }
  if (action.type === 'change') return { past: [...state.past.slice(-49), state.current], current: action.rows, future: [] }
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0, -1), current: state.past.at(-1)!, future: [state.current, ...state.future] }
  if (action.type === 'redo' && state.future.length) return { past: [...state.past, state.current], current: state.future[0], future: state.future.slice(1) }
  return state
}
export function MappingEditor({ record, schemas, mappings, busy, saving, dirty, readOnly, onDirty, mutate, onBack }: Props) {
  const pairs = useMemo(() => mappingPairs(record, schemas), [record, schemas])
  const [selectedKey, setSelectedKey] = useState(() => pairs.find(pairSupportsMapping)?.key ?? pairs[0].key)
  const [history, dispatch] = useReducer(historyReducer, mappings, (initial) => ({ past: [], current: mappingDrafts(initial), future: [] }))
  const rows = history.current
  const [aiPending, setAiPending] = useState(false)
  const pair = pairs.find((item) => item.key === selectedKey) ?? pairs[0]
  const trees = useMemo(() => new Map(pairs.map((item) => [item.key, {
    source: studioSchemaTree(item.source),
    target: studioSchemaTree(item.target),
  }])), [pairs])
  const tree = trees.get(pair.key)!
  const issues = mappingIssues(record, schemas, rows)
  const removedCount = mappings.filter((mapping) => !rows.some((row) => row.key === `saved-${mapping.id}`)).length
  const supported = pairSupportsMapping(pair)
  const blocked = busy || readOnly
  const links: StudioLink[] = rows.map((row) => {
    const rowPair = pairForMapping(pairs, row)
    const rowTree = rowPair ? trees.get(rowPair.key) : undefined
    const sourcePath = rowTree && rowPair?.source ? displayFieldPath(row.sourceFieldPath, rowTree.source.fields, schemaFormat(rowPair.source)) : row.sourceFieldPath
    const targetPath = rowTree && rowPair?.target ? displayFieldPath(row.targetFieldPath, rowTree.target.fields, schemaFormat(rowPair.target)) : row.targetFieldPath
    const origin = mappings.find((item) => row.key === `saved-${item.id}`)?.origin
    return {
      id: row.key, source: sourcePath, target: targetPath,
      origin,
      pairKey: rowPair?.key ?? 'unmatched', pairLabel: rowPair?.label ?? `Şema #${row.sourceSchemaId} → #${row.targetSchemaId}`,
      notes: [
        ...(!rowPair ? ['Şema çifti bu akışa ait değil veya şema bulunamadı. Geçerli bir çift seçin veya bağlantıyı kaldırın.'] : !pairSupportsMapping(rowPair) ? ['Bu şema çifti alan eşlemesini desteklemiyor. Bağlantıyı kaldırın.'] : []),
        ...(!row.sourceFieldPath.trim() || !row.targetFieldPath.trim() ? ['Kaynak ve hedef alan yollarını doldurun.'] : []),
        ...(rowTree ? fieldNotes({ ...row, sourceFieldPath: sourcePath, targetFieldPath: targetPath }, rowTree.source.fields, rowTree.target.fields) : []),
      ],
    }
  })
  const commit = (next: MappingDraft[]) => { if (blocked) return; dispatch({ type: 'change', rows: next }); onDirty() }
  const add = (source = '', target = '') => {
    if (blocked || !supported || !pair.source || !pair.target) return undefined
    if (rows.some((row) => row.sourceSchemaId === pair.source!.id && row.targetSchemaId === pair.target!.id && row.sourceFieldPath.trim() === source && row.targetFieldPath.trim() === target && source && target)) return undefined
    const key = crypto.randomUUID()
    commit([...rows, { key, sourceSchemaId: pair.source.id, targetSchemaId: pair.target.id, sourceFieldPath: source, targetFieldPath: target }])
    return key
  }
  const update = (id: string, source: string, target: string, pairKey: string) => {
    if (blocked) return false
    const nextPair = pairs.find((item) => item.key === pairKey)
    if (nextPair && !pairSupportsMapping(nextPair)) return false
    commit(rows.map((row) => row.key === id ? {
      ...row, sourceFieldPath: source, targetFieldPath: target,
      ...(nextPair?.source && nextPair.target ? { sourceSchemaId: nextPair.source.id, targetSchemaId: nextPair.target.id } : {}),
    } : row))
    return true
  }
  const response = pair.sourceType.endsWith('RESPONSE')
  const sourceName = (response ? record.destinationSystem : record.sourceSystem) || 'Kaynak'
  const targetName = (response ? record.sourceSystem : record.destinationSystem) || 'Hedef'
  const middlewareName = record.hasMiddleware ? record.middleware?.trim() || 'Ara katman' : 'Doğrudan akış'
  const changed = rows.length !== mappings.length || rows.some((row, index) => {
    const original = mappings[index]
    return !original || row.sourceSchemaId !== original.sourceSchemaId || row.targetSchemaId !== original.targetSchemaId || row.sourceFieldPath.trim() !== original.sourceFieldPath.trim() || row.targetFieldPath.trim() !== original.targetFieldPath.trim()
  })
  const pane = (side: 'source' | 'target') => {
    const schema = pair[side]
    const format = schema ? schemaFormat(schema) : '—'
    const name = record.hasMiddleware ? side === 'source' ? `${sourceName} → ${middlewareName}` : `${middlewareName} → ${targetName}` : side === 'source' ? sourceName : targetName
    return { name, caption: `${side === 'source' ? 'Gelen' : 'Giden'} ${response ? 'yanıt' : 'istek'}`, fileName: schema?.fileName || `${response ? 'response' : 'request'}.${schema ? format.toLowerCase() : 'json'}`, format, fields: tree[side].fields }
  }

  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault()
    if (blocked || aiPending || issues.length > 0) return
    void mutate(() => dirty && changed ? saveMappings(record.id, mappingRequests(record, schemas, rows)) : Promise.resolve(), 'Alan eşlemeleri kaydedildi.', saveIntent(event))
  }}>
    <MappingStudio middlewareName={middlewareName} source={pane('source')} target={pane('target')} pairs={pairs.map((item) => ({ key: item.key, label: item.label, disabled: !pairSupportsMapping(item) }))} pairKey={pair.key} links={links} supported={supported} busy={busy} readOnly={readOnly} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onPairChange={(key) => { if (aiPending && !window.confirm('Kaydedilmemiş AI önerileri kapatılacak. Akışı değiştirmek istiyor musunuz?')) return; setAiPending(false); setSelectedKey(key) }} onConnect={add} onAdd={() => add()} onUpdate={update} onRemove={(id) => commit(rows.filter((row) => row.key !== id))} onUndo={() => { if (!blocked) { dispatch({ type: 'undo' }); onDirty() } }} onRedo={() => { if (!blocked) { dispatch({ type: 'redo' }); onDirty() } }} onClear={() => { if (!blocked && window.confirm('Tüm istek ve yanıt eşlemeleri kaldırılacak. Değişiklik kaydettiğinizde uygulanır. Devam edilsin mi?')) commit([]) }}>
      {!readOnly && <AiMappingAssistant key={pair.key} record={record} pair={pair} pairs={pairs} rows={rows} saved={mappings} busy={busy} onPendingChange={(pending) => { setAiPending(pending); if (pending) onDirty() }} onAccept={async (input, key) => {
        let added: FieldMapping[] = []
        let failure: unknown
        const success = await mutate(async () => {
          try { added = (await appendMappings(record.id, input, key)).addedMappings }
          catch (error) { failure = error; throw error }
        }, 'AI önerileri mevcut bağlantılar korunarak eklendi.', 'stay', { preserveDraft: true, preserveDirty: changed })
        if (success) dispatch({ type: 'appendSaved', rows: mappingDrafts(added) })
        else if (failure) throw failure
        return success
      }} />}
      {!supported && <p role="status" className="hint">{!pair.source || !pair.target ? 'Bu akış için gerekli şema çifti henüz kayıtlı değil. Önce İstek ve yanıt adımından örnekleri kaydedin. Mevcut eşlemeler aşağıda korunur.' : 'Bu çift alan eşlemesini desteklemiyor. Örnekleri İstek ve yanıt adımından inceleyebilirsiniz.'}</p>}
      {[...new Set([...tree.source.warnings, ...tree.target.warnings])].map((warning) => <p key={warning} className="hint text-amber-200">{warning}</p>)}
      {removedCount > 0 && <p role="status" className="text-xs text-amber-200">Kaydettiğinizde {removedCount} kayıtlı eşleme kaldırılacak.</p>}
      {issues.length > 0 && <div role="alert" className="error-panel"><p>{readOnly ? 'Kayıtlı eşlemelerde kontrol gereken alanlar var. Düzeltmek için Alan eşleme adımını açın:' : 'Eşlemeleri kaydetmeden önce aşağıdaki alanları düzeltin:'}</p><ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    </MappingStudio>
    {!readOnly && <>{aiPending && <p role="status" className="hint text-violet-200">AI önerileri henüz kaydedilmedi. Yukarıdan seçilen önerileri ekleyin veya önerileri kapatın.</p>}<SaveActions busy={busy} saving={saving} disabled={issues.length > 0 || aiPending} onBack={onBack} /></>}
  </form>
}

export function MappingReview({ record, schemas, mappings, busy }: Pick<Props, 'record' | 'schemas' | 'mappings' | 'busy'>) {
  return <MappingEditor record={record} schemas={schemas} mappings={mappings} busy={busy} saving={false} dirty={false} readOnly onDirty={() => {}} mutate={async () => false} onBack={() => {}} />
}

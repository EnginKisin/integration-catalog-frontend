const uploadCaptures = new WeakMap()
const instrumentedPages = new WeakSet()

export async function mockCatalog(page, { role = 'ADMIN', item, configs = [], schemas = [], mappings = [], xmlTrees = {}, systems = [
  { id: 1, name: 'ERP', active: true, description: '', usageCount: 0 },
  { id: 2, name: 'CRM', active: true, description: '', usageCount: 0 },
  { id: 3, name: 'ESB', active: true, description: '', usageCount: 0 },
] } = {}) {
  const state = {
    record: item ? { id: 30, name: 'Sipariş aktarımı', description: '', sourceSystemId: 1, destinationSystemId: 2, middlewareSystemId: null, hasMiddleware: false, isSync: false, sourcePayloadFormat: 'JSON', destinationPayloadFormat: 'JSON', status: 'DRAFT', reviewRequired: false, ...item } : undefined,
    configs, schemas, mappings, calls: [], failures: new Map(), sampleFiles: new Map(),
    systems: systems.map((system) => ({ ...system })),
  }
  uploadCaptures.set(page, [])
  if (!instrumentedPages.has(page)) {
    instrumentedPages.add(page)
    await page.exposeBinding('__catalogUploadCapture', ({ page: source }, body) => uploadCaptures.get(source).push(body))
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        if (init?.body instanceof FormData) {
          const file = init.body.get('file')
          const metadata = init.body.get('metadata')
          await window.__catalogUploadCapture({ metadata: JSON.parse(await metadata.text()), file: { name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) } })
        }
        return originalFetch(input, init)
      }
    })
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    const method = request.method()
    const multipart = request.headers()['content-type']?.startsWith('multipart/form-data')
    let body
    if (multipart) {
      const captured = uploadCaptures.get(page).shift()
      if (!captured) throw new Error('Multipart request body was not observed')
      body = { metadata: captured.metadata, file: { ...captured.file, bytes: Buffer.from(captured.file.bytes) } }
    } else body = request.postDataJSON()
    state.calls.push({ path, method, body })
    const json = (value, status = 200) => route.fulfill({ status, json: value })
    const empty = () => route.fulfill({ status: 204 })
    const typedFailure = `${method} ${path} ${body?.schemaType ?? body?.metadata?.schemaType}`
    const failureKey = state.failures.has(typedFailure) ? typedFailure : `${method} ${path}`
    if (state.failures.has(failureKey)) {
      const failure = state.failures.get(failureKey)
      state.failures.delete(failureKey)
      return typeof failure === 'number' ? json({ message: 'Bu kayıt şu anda güncellenemiyor.' }, failure) : json(failure.body, failure.status)
    }
    const systemName = (id) => state.systems.find((system) => system.id === id)?.name ?? null
    const systemRecord = (system) => ({ ...system, usageCount: Math.max(system.usageCount, state.record && [state.record.sourceSystemId, state.record.destinationSystemId, state.record.middlewareSystemId].includes(system.id) ? 1 : 0) })
    const fullRecord = () => ({ ...state.record, sourceSystemName: systemName(state.record.sourceSystemId), destinationSystemName: systemName(state.record.destinationSystemId), middlewareSystemName: systemName(state.record.middlewareSystemId), environmentTypes: ['DEV', 'TEST', 'PROD'].filter((type) => state.configs.some((config) => config.environmentType === type)), environmentConfigs: state.configs, updatedAt: '2026-10-25T12:00:00' })
    if (path === '/auth/me') return json({ username: 'test-user', email: null, emailVerified: false, active: true, authorities: [`ROLE_${role}`], permissions: [] })
    if (path === '/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'e2e-only' })
    if (path === '/systems') {
      if (method === 'GET') {
        const active = new URL(request.url()).searchParams.get('active')
        return json(state.systems.filter((system) => active == null || system.active === (active === 'true')).map(systemRecord))
      }
      if (method === 'POST') {
        const created = { ...body, id: Math.max(0, ...state.systems.map((system) => system.id)) + 1, active: true, usageCount: 0 }
        state.systems.push(created)
        return json(created, 201)
      }
    }
    const systemPath = path.match(/^\/systems\/(\d+)(\/active)?$/)
    if (systemPath) {
      const system = state.systems.find((entry) => entry.id === Number(systemPath[1]))
      if (!system) return json({ message: 'System not found' }, 404)
      if (method === 'GET') return json(systemRecord(system))
      if (method === 'PUT') { Object.assign(system, body); return json(systemRecord(system)) }
      if (method === 'PATCH' && systemPath[2]) { system.active = body.active; return json(systemRecord(system)) }
      if (method === 'DELETE') {
        if (systemRecord(system).usageCount > 0) return json({ code: 'SYSTEM_IN_USE', message: 'System is used by integration(s); deactivate it instead', params: { usageCount: systemRecord(system).usageCount } }, 409)
        state.systems = state.systems.filter((entry) => entry.id !== system.id)
        return empty()
      }
    }
    if ((path === '/integrations' && method === 'POST') || (path === '/integrations/30' && method === 'PUT')) {
      if (['sourceId', 'destinationId', 'middlewareId'].some((field) => field in body) || !body.sourceSystemId || !body.destinationSystemId || (body.hasMiddleware && !body.middlewareSystemId)) return json({ message: 'Common system IDs required' }, 400)
      for (const field of ['sourceSystemId', 'destinationSystemId', 'middlewareSystemId']) {
        if (body[field] == null) continue
        const system = state.systems.find((entry) => entry.id === body[field])
        if (!system) return json({ message: 'System not found' }, 404)
        if (!system.active && !(method === 'PUT' && state.record?.[field] === system.id)) return json({ message: 'Inactive system cannot be selected' }, 409)
      }
    }
    if (path === '/integrations') {
      if (method === 'GET') return json(state.record ? [fullRecord()] : [])
      if (method === 'POST') {
        state.record = { ...body, id: 30, status: 'DRAFT', reviewRequired: false }
        return json(fullRecord(), 201)
      }
    }
    if (path === '/integrations/30') {
      if (method === 'GET') return json(fullRecord())
      if (method === 'PUT') { state.record = { ...state.record, ...body }; return json(fullRecord()) }
      if (method === 'DELETE') { state.record = undefined; return empty() }
    }
    if (path === '/integrations/30/configs' && method === 'POST') {
      state.configs = body.map(({ authCredentials, ...config }, index) => ({
        ...config, id: index + 1,
        credentialsConfigured: config.authType !== 'NONE' && (Boolean(authCredentials) || Boolean(state.configs.find((original) => original.environmentType === config.environmentType && original.configTarget === config.configTarget)?.credentialsConfigured)),
      }))
      state.record.status = 'DRAFT'
      return empty()
    }
    const download = path.match(/^\/integrations\/30\/mappings\/schemas\/(\d+)\/sample$/)
    if (download) {
      const file = state.sampleFiles.get(Number(download[1]))
      return file ? route.fulfill({ status: 200, body: file.bytes, contentType: file.type || 'application/octet-stream' }) : json({ message: 'Örnek dosya bulunamadı' }, 404)
    }
    if (path === '/integrations/30/mappings/schemas' || path === '/integrations/30/mappings/schemas/upload') {
      if (method === 'GET') return json(state.schemas)
      const content = multipart ? body.metadata : body
      const format = content.format ?? 'JSON'
      const file = multipart ? body.file : undefined
      const rawContent = format === 'EXCEL' || format === 'JSON' ? null : file ? file.bytes.toString('utf8').replace(/^\uFEFF/, '') : content.rawContent
      const existing = state.schemas.find((schema) => schema.schemaType === content.schemaType)
      const schema = { id: existing?.id ?? 40 + state.schemas.length, schemaType: content.schemaType, format, rawContent,
        mappingSupported: !['CSV', 'EXCEL'].includes(format),
        schemaDefinition: format === 'JSON' ? file ? JSON.parse(file.bytes.toString('utf8')) : content.schemaDefinition ?? content.samplePayload : ['XML', 'IDOC'].includes(format) ? xmlTrees[rawContent] ?? { kind: format === 'XML' ? 'xml' : 'idoc-xml', fields: [] } : {},
        ...(content.samplePayload ? { samplePayload: content.samplePayload } : {}),
        ...(content.targetFormat ? {
          targetFormat: content.targetFormat,
          targetSchemaDefinition: content.targetFormat === 'JSON' ? content.targetSchemaDefinition ?? content.targetSamplePayload : xmlTrees[content.targetRawContent] ?? { kind: content.targetFormat === 'XML' ? 'xml' : 'idoc-xml', fields: [] },
          targetSamplePayload: content.targetSamplePayload, targetRawContent: content.targetRawContent,
        } : existing?.targetFormat ? { targetFormat: existing.targetFormat, targetSchemaDefinition: existing.targetSchemaDefinition, targetSamplePayload: existing.targetSamplePayload, targetRawContent: existing.targetRawContent } : {}),
        ...(format === 'CSV' ? { csvOptions: content.csvOptions ?? { delimiter: ',', hasHeader: true } } : {}),
      }
      state.sampleFiles.delete(schema.id)
      const storedFile = file ?? (format === 'CSV' ? { name: 'sample.csv', type: 'text/csv', bytes: Buffer.from(rawContent) } : undefined)
      if (storedFile) {
        Object.assign(schema, { fileName: storedFile.name, contentType: storedFile.type, fileSize: storedFile.bytes.length, sampleDownloadUrl: `/api/v1/integrations/30/mappings/schemas/${schema.id}/sample` })
        state.sampleFiles.set(schema.id, storedFile)
      }
      state.schemas = [...state.schemas.filter((entry) => entry.id !== schema.id), schema]
      state.record.status = 'DRAFT'
      return json(schema)
    }
    if (path === '/integrations/30/mappings/fields') {
      if (method === 'GET') return json(state.mappings)
      state.mappings = body.map((mapping, index) => ({ ...mapping, id: index + 1 }))
      state.record.status = 'DRAFT'
      return empty()
    }
    if (path === '/integrations/30/mappings/ai/capabilities') return json({ enabled: false, available: false, provider: 'ollama', model: 'test-model', supportedFormats: ['JSON', 'XML', 'IDOC'], maxFieldsPerSide: 100, code: 'AI_DISABLED' })
    if (path === '/integrations/30/complete') { state.record.status = 'COMPLETED'; return empty() }
    if (path === '/integrations/30/review/confirm') { state.record.reviewRequired = false; return json(fullRecord()) }
    return json({ message: `Beklenmeyen test isteği: ${method} ${path}` }, 500)
  })
  return state
}

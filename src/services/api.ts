import { errorText, readErrorCode, readErrorMetadata, violationText } from '../lib/apiErrors.ts'
import type { ApiViolation, ErrorMetadata, ErrorParams } from '../lib/apiErrors'

const ROOT = '/api/v1'
type Csrf = { headerName: string; parameterName: string; token: string }
let csrf: Csrf | undefined
let csrfRequest: Promise<void> | undefined
let recovery: Promise<void> | undefined
const cooldowns = new Map<string, number>()
let csrfGeneration = 0

export class ApiError extends Error {
  status: number
  details: string[]
  retryAt?: number
  code?: string
  requestId?: string
  violations: ApiViolation[]
  params: ErrorParams
  constructor(message: string, status = 0, details: string[] = [], retryAt?: number, code?: string, metadata: ErrorMetadata = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.retryAt = retryAt
    this.code = code
    this.requestId = metadata.requestId
    this.violations = metadata.violations ?? []
    this.params = metadata.params ?? {}
  }
}
export function clearCsrf() { csrfGeneration += 1; csrf = undefined; csrfRequest = undefined }
function normalizePath(path: string) {
  if (path === ROOT) return ''
  if (path.startsWith(`${ROOT}/`)) return path.slice(ROOT.length)
  if (!path.startsWith('/') || path.startsWith('//')) throw new ApiError('Geçersiz API yolu.')
  return path
}
function expiredSession() {
  clearCsrf()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('session-expired'))
}
function cooldownKey(path: string) { return path.startsWith('/auth/') ? '/auth' : path.split('?')[0] }
function parseBody(text: string): unknown {
  if (!text) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}
function retryTime(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const time = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}
async function send<T>(path: string, init: RequestInit, responseType: 'json' | 'blob' = 'json'): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${ROOT}${path}`, { ...init, credentials: 'include', cache: 'no-store' })
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. Kayıt isteği gönderdiyseniz tekrar denemeden önce güncel kaydı kontrol edin.')
  }
  if (response.ok && responseType === 'blob') {
    try { return await response.blob() as T }
    catch { throw new ApiError('Dosya indirilemedi. Yeniden deneyebilirsiniz.') }
  }
  let responseText: string
  try { responseText = await response.text() } catch {
    throw new ApiError('Sunucu yanıtı alınamadı. Tekrar kaydetmeden önce güncel kaydı kontrol edin.')
  }
  const body = parseBody(responseText)
  if (!response.ok) {
    const error = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    const retryAt = response.status === 429 ? retryTime(response.headers.get('Retry-After')) : undefined
    if (retryAt) cooldowns.set(cooldownKey(path), retryAt)
    const code = readErrorCode(error.code)
    const metadata = readErrorMetadata(error, response.headers.get('X-Request-ID'))
    throw new ApiError(errorText(code, metadata.params, response.status), response.status,
      metadata.violations.map(violationText), retryAt, code, metadata)
  }
  if (responseText && body === undefined) throw new ApiError('Sunucudan beklenen JSON yanıtı alınamadı. Bağlantı ayarlarını kontrol edin.')
  return body as T
}
export async function refreshCsrf(): Promise<void> {
  if (!csrfRequest) {
    const generation = csrfGeneration
    csrfRequest = send<Csrf>('/auth/csrf', { method: 'GET' }).then((value) => {
      if (!value?.headerName || !value.token) throw new ApiError('Güvenlik anahtarı alınamadı.')
      if (generation === csrfGeneration) csrf = value
    }).finally(() => { if (generation === csrfGeneration) csrfRequest = undefined })
  }
  return csrfRequest
}
async function recoverForbidden() {
  if (!recovery) recovery = (async () => {
    try {
      await send('/auth/me', { method: 'GET' })
      clearCsrf()
      await refreshCsrf()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expiredSession()
    }
  })().finally(() => { recovery = undefined })
  return recovery
}
export async function request<T = void>(path: string, init: RequestInit = {}, responseType: 'json' | 'blob' = 'json'): Promise<T> {
  path = normalizePath(path)
  const method = (init.method ?? 'GET').toUpperCase()
  const retryAt = cooldowns.get(cooldownKey(path))
  if (method !== 'GET' && retryAt && retryAt > Date.now()) {
    throw new ApiError('Tekrar göndermeden önce bekleyin.', 429, [], retryAt)
  }
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) await refreshCsrf()
    if (!csrf) throw new ApiError('Oturum değişti. İşlemi yeniden başlatın.')
    headers.set(csrf!.headerName, csrf!.token)
  }
  try {
    return await send<T>(path, { ...init, method, headers }, responseType)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 && !path.startsWith('/auth/')) expiredSession()
      if (error.status === 401 && ['/auth/password/change', '/auth/email/change'].includes(path)) {
        try { await send('/auth/me', { method: 'GET' }) }
        catch (failure) { if (failure instanceof ApiError && failure.status === 401) expiredSession() }
      }
      if (error.status === 403 && path !== '/auth/csrf' && (!error.code || ['CSRF_MISSING', 'CSRF_INVALID'].includes(error.code))) await recoverForbidden()
    }
    throw error
  }
}
export const get = <T>(path: string) => request<T>(path)
export const getBlob = (path: string) => request<Blob>(path, {}, 'blob')
function json<T>(method: string, path: string, body?: unknown) {
  return request<T>(path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}
export const post = <T = void>(path: string, body?: unknown) => json<T>('POST', path, body)
export const put = <T = void>(path: string, body?: unknown) => json<T>('PUT', path, body)
export const patch = <T = void>(path: string, body?: unknown) => json<T>('PATCH', path, body)
export const del = (path: string) => request<void>(path, { method: 'DELETE' })


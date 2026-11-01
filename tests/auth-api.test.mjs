import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, clearCsrf, get, post, request } from '../src/services/api.ts'
import { login, logout, isAdmin, canEdit, canViewCredentials, canManageCredentials } from '../src/services/auth.ts'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const token = (value = 'csrf-test') => json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: value })
let calls
let events
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    return handler(url, init)
  }
}
beforeEach(() => {
  clearCsrf()
  calls = []
  events = 0
  globalThis.window = new EventTarget()
  window.addEventListener('session-expired', () => { events += 1 })
})
after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow })

describe('Oturum ve API sözleşmesi', () => {
  it('aynı origin kullanır; mevcut servis yollarına ikinci API öneki eklemez', async () => {
    mock(() => json([]))
    await get('/api/v1/integrations')
    assert.equal(calls[0].url, '/api/v1/integrations')
    assert.equal(calls[0].credentials, 'include')
    assert.equal(calls[0].cache, 'no-store')
    assert.equal(calls.length, 1)
    await assert.rejects(get('https://example.com/secret'), ApiError)
    await assert.rejects(get('//example.com/secret'), ApiError)
    assert.equal(calls.length, 1)
  })
  it('ilk yazmadan önce CSRF alır ve boş başarılı yanıtları işler', async () => {
    mock((url) => url.endsWith('/csrf') ? token() : new Response(null, { status: 204 }))
    assert.equal(await post('/test-empty', { name: 'örnek' }), undefined)
    assert.equal(calls[0].url, '/api/v1/auth/csrf')
    assert.equal(new Headers(calls[1].headers).get('X-CSRF-TOKEN'), 'csrf-test')
    assert.equal(new Headers(calls[1].headers).get('Content-Type'), 'application/json')
    assert.equal(calls[1].body, JSON.stringify({ name: 'örnek' }))
    mock(() => new Response('', { status: 200 }))
    assert.equal(await post('/test-empty'), undefined)
  })
  it('eşzamanlı ilk yazmalar için tek CSRF isteği yapar', async () => {
    mock(async (url) => url.endsWith('/csrf') ? token() : new Response(null, { status: 200 }))
    await Promise.all([post('/concurrent-one'), post('/concurrent-two')])
    assert.equal(calls.filter((call) => call.url.endsWith('/csrf')).length, 1)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 2)
  })
  it('girişi form-urlencoded gönderir, sonra CSRF yeniler ve profili okur', async () => {
    let counter = 0
    mock((url) => {
      if (url.endsWith('/csrf')) return token(`token-${++counter}`)
      if (url.endsWith('/me')) return json({ username: 'editor', email: null, emailVerified: false, active: true, authorities: ['ROLE_EDITOR'], permissions: [] })
      return new Response(null, { status: 200 })
    })
    const profile = await login('örnek kullanıcı', 'test password + &')
    assert.equal(profile.username, 'editor')
    assert.deepEqual(calls.map((call) => call.url), ['/api/v1/auth/csrf', '/api/v1/auth/login', '/api/v1/auth/csrf', '/api/v1/auth/me'])
    assert.equal(new Headers(calls[1].headers).get('Content-Type'), 'application/x-www-form-urlencoded')
    assert.equal(new Headers(calls[1].headers).get('X-CSRF-TOKEN'), 'token-1')
    assert.equal(new URLSearchParams(calls[1].body).get('password'), 'test password + &')
    await post('/after-login')
    assert.equal(new Headers(calls.at(-1).headers).get('X-CSRF-TOKEN'), 'token-2')
  })
  it('yanlış parolada girişi tekrar göndermez ve uygulama oturumunu sonlandırma olayı üretmez', async () => {
    mock((url) => url.endsWith('/csrf') ? token() : json({ message: 'Giriş bilgileri hatalı' }, 401))
    await assert.rejects(login('editor', 'wrong-password'), (error) => error instanceof ApiError && error.status === 401)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
    assert.equal(events, 0)
  })
  it('403 sonrası oturumu/CSRFyi kontrol eder, başarısız yazmayı otomatik tekrarlamaz', async () => {
    let writes = 0
    mock((url) => {
      if (url.endsWith('/csrf')) return token('fresh')
      if (url.endsWith('/me')) return json({ username: 'editor' })
      writes += 1
      return writes === 1 ? json({}, 403) : new Response(null, { status: 200 })
    })
    await assert.rejects(post('/forbidden-write'), (error) => error.status === 403)
    assert.equal(writes, 1)
    assert.equal(events, 0)
    assert.equal(calls.filter((call) => call.url.endsWith('/csrf')).length, 2)
    await post('/forbidden-write')
    assert.equal(writes, 2)
  })
  it('süresi dolmuş oturumun 403 yanıtında giriş ekranını tetikler', async () => {
    mock((url) => url.endsWith('/csrf') ? token() : json({}, url.endsWith('/me') ? 401 : 403))
    await assert.rejects(post('/expired-write'), (error) => error.status === 403)
    assert.equal(events, 1)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('korunan GET 401 döndüğünde oturumu temizler', async () => {
    mock(() => json({}, 401))
    await assert.rejects(get('/api/v1/integrations'), (error) => error.status === 401)
    assert.equal(events, 1)
  })
  it('409 ayrıntılarını korur, sunucu hatasındaki teknik bilgileri göstermez', async () => {
    mock((url) => url.endsWith('/csrf') ? token() : json({ code: 'INTEGRATION_INCOMPLETE', message: 'Not ready', details: ['Do not show raw fallback'], violations: [{ field: null, code: 'DESTINATION_CONFIG_REQUIRED', params: { environment: 'DEV' } }] }, 409))
    await assert.rejects(post('/completion'), (error) => {
      assert.ok(error.message.includes('Entegrasyon henüz tamamlanmaya hazır değil'))
      assert.deepEqual(error.details, ['Bu ortam için hedef sistem bağlantısını tanımlayın. (Ortam: DEV)'])
      return error.status === 409
    })
    mock(() => json({ message: 'internal secret database detail', details: ['private'] }, 503))
    await assert.rejects(get('/unavailable'), (error) => !error.message.includes('secret') && error.details.length === 0 && error.status === 503)
  })
  it('ağ kesintisinde yazmayı tekrar göndermez', async () => {
    mock((url) => { if (url.endsWith('/csrf')) return token(); throw new TypeError('network failure') })
    await assert.rejects(post('/uncertain-write'), (error) => error instanceof ApiError && error.status === 0 && error.message.includes('güncel kaydı kontrol edin'))
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('çıkış başarısız olsa bile önceki CSRF değerini temizler', async () => {
    let counter = 0
    mock((url) => url.endsWith('/csrf') ? token(`token-${++counter}`) : url.endsWith('/logout') ? json({}, 500) : new Response(null, { status: 200 }))
    await assert.rejects(logout(), (error) => error.status === 500)
    await post('/after-logout')
    assert.equal(counter, 2)
    assert.equal(new Headers(calls.at(-1).headers).get('X-CSRF-TOKEN'), 'token-2')
  })
  it('oturum değişirken gelen eski CSRF ile yazma yapmaz', async () => {
    let resolveToken
    mock((url) => url.endsWith('/csrf') ? new Promise((resolve) => { resolveToken = resolve }) : new Response(null, { status: 200 }))
    const pending = post('/stale-session')
    clearCsrf()
    resolveToken(token('stale'))
    await assert.rejects(pending, (error) => error.message.includes('Oturum değişti'))
    assert.equal(calls.filter((call) => call.method === 'POST').length, 0)
  })
  it('429 Retry-After süresinde yeniden yazma isteğini engeller', async () => {
    mock((url) => url.endsWith('/csrf') ? token() : json({ message: 'Bekleyin' }, 429, { 'Retry-After': '60' }))
    await assert.rejects(post('/rate-limited'), (error) => error.status === 429 && error.retryAt > Date.now())
    const before = calls.length
    await assert.rejects(post('/rate-limited'), (error) => error.status === 429)
    assert.equal(calls.length, before)
  })
  it('JSON yerine gelen proxy/HTML yanıtını başarılı veri gibi kullanmaz', async () => {
    mock(() => new Response('<html>proxy error</html>', { status: 200 }))
    await assert.rejects(get('/proxy-response'), ApiError)
  })
  it('ADMIN yetkilerini ve VIEWER/EDITOR credential sınırlarını ayrı değerlendirir', () => {
    const user = (role, permissions = []) => ({ authorities: [`ROLE_${role}`], permissions })
    assert.equal(isAdmin(user('ADMIN')), true)
    assert.equal(canEdit(user('VIEWER')), false)
    assert.equal(canEdit(user('EDITOR')), true)
    assert.equal(canViewCredentials(user('ADMIN')), true)
    assert.equal(canManageCredentials(user('ADMIN')), true)
    assert.equal(canManageCredentials(user('EDITOR')), false)
    assert.equal(canManageCredentials(user('EDITOR', ['MANAGE_CREDENTIALS'])), true)
    assert.equal(canManageCredentials(user('VIEWER', ['MANAGE_CREDENTIALS'])), false)
    assert.equal(canViewCredentials(user('VIEWER', ['VIEW_CREDENTIALS'])), true)
  })
})

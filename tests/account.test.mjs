import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, clearCsrf } from '../src/services/api.ts'
import { getProfile, login } from '../src/services/auth.ts'
import { changeEmail, changePassword, completeAccountAction, requestPasswordReset } from '../src/services/accountBackend.ts'
import { fetchMailStatus, fetchUsers, forcePasswordReset, inviteUser, resendInvitation, revokeUserSessions, setUserActive, setUserPermissions, setUserRole } from '../src/services/usersBackend.ts'
import { invalidatesUserSession, invitationInput, isCurrentAccount, normalizeEmail, parseAccountFragment, permissionInput, resetRequestMessage, validateNewPassword } from '../src/lib/account.ts'
import { captureAccountLink, clearAccountLink, getAccountLink } from '../src/lib/accountLinkStore.ts'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const account = (changes = {}) => ({ id: 10, username: 'editor', email: 'editor@example.test', emailVerified: true, active: true, passwordResetRequired: false, role: 'EDITOR', permissions: [], ...changes })
const profile = (changes = {}) => ({ username: 'admin', email: null, emailVerified: false, active: true, authorities: ['ROLE_ADMIN'], permissions: [], ...changes })
const password = ' new password 123 '
let calls
let expired
function mock(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'account-test' })
    return handler(url, init)
  }
}
beforeEach(() => {
  clearCsrf(); clearAccountLink(); calls = []; expired = 0
  globalThis.window = new EventTarget()
  window.addEventListener('session-expired', () => { expired += 1 })
})
after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; clearAccountLink() })

describe('ADMIN kullanıcı yönetimi', () => {
  it('listeyi sayfalı ister ve DTO dışı parola/hash alanlarını bellekteki modele taşımaz', async () => {
    mock(() => json({ items: [account({ password: 'unexpected', passwordHash: 'unexpected' })], page: 2, size: 50, totalElements: 101, totalPages: 3 }))
    const result = await fetchUsers(2, 50)
    assert.equal(calls[0].url, '/api/v1/users?page=2&size=50')
    assert.equal(result.totalPages, 3)
    assert.equal(result.items[0].id, 10)
    assert.equal(Object.hasOwn(result.items[0], 'password'), false)
    assert.equal(Object.hasOwn(result.items[0], 'passwordHash'), false)
  })
  it('geçersiz sayfalarda istek göndermez; bozuk liste yanıtını başarı saymaz', async () => {
    mock(() => json({ items: [] }))
    for (const [page, size] of [[-1, 20], [0, 101], [0, 0], [0.5, 20]]) await assert.rejects(fetchUsers(page, size), /sayfa/)
    assert.equal(calls.length, 0)
    await assert.rejects(fetchUsers(), ApiError)
  })
  it('davet gövdesi yalnızca username/email/role içerir; ADMIN parola belirlemez', async () => {
    mock(() => json(account({ active: false, emailVerified: false }), 201))
    const created = await inviteUser({ username: ' editor ', email: ' Editor@Example.Test ', role: 'EDITOR', password: 'must-not-send', permissions: ['MANAGE_CREDENTIALS'] })
    const write = calls.find((call) => call.method === 'POST')
    assert.equal(write.url, '/api/v1/users')
    assert.deepEqual(JSON.parse(write.body), { username: 'editor', email: 'editor@example.test', role: 'EDITOR' })
    assert.equal(created.active, false)
    assert.equal(created.emailVerified, false)
  })
  it('rol, aktiflik ve izinleri ayrı endpointlere gönderir; izin listesini tam değiştirir', async () => {
    mock(() => json(account()))
    await setUserRole(10, 'VIEWER')
    await setUserActive(10, false)
    await setUserPermissions(10, ['MANAGE_CREDENTIALS'])
    await setUserPermissions(10, [])
    assert.deepEqual(calls.filter((call) => call.method === 'PUT').map((call) => [call.url, JSON.parse(call.body)]), [
      ['/api/v1/users/10/role', { role: 'VIEWER' }], ['/api/v1/users/10/active', { active: false }],
      ['/api/v1/users/10/permissions', { permissions: ['MANAGE_CREDENTIALS'] }], ['/api/v1/users/10/permissions', { permissions: [] }],
    ])
  })
  it('son aktif ADMIN için 409u korur; başka hesabı veya rolü otomatik değiştirmez', async () => {
    mock(() => json({ code: 'LAST_ADMIN_REQUIRED', message: 'Last active ADMIN cannot be deactivated' }, 409))
    await assert.rejects(setUserActive(10, false), (error) => error.status === 409 && error.code === 'LAST_ADMIN_REQUIRED' && error.message.includes('yöneticinin'))
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 1)
    assert.ok(calls.every((call) => !call.url.endsWith('/role')))
  })
  it('davet tekrarını, zorunlu reseti ve oturum iptalini boş 202/204 ile işler', async () => {
    mock((url) => new Response(null, { status: url.endsWith('/revoke') ? 204 : 202 }))
    await resendInvitation(10); await forcePasswordReset(10); await revokeUserSessions(10)
    assert.deepEqual(calls.filter((call) => call.method === 'POST').map((call) => call.url), ['/api/v1/users/10/invitations/resend', '/api/v1/users/10/password-reset', '/api/v1/users/10/sessions/revoke'])
    assert.ok(calls.filter((call) => call.method === 'POST').every((call) => call.body === undefined))
  })
  it('postanın pending/failed sayısını okur; teslimat durumu icat etmez', async () => {
    mock(() => json({ pending: 3, failed: 2, delivered: 999 }))
    assert.deepEqual(await fetchMailStatus(), { pending: 3, failed: 2 })
    assert.equal(calls[0].url, '/api/v1/users/mail-status')
  })
  it('401de oturumu temizler; yetkisiz ADMIN isteğini tekrarlamaz', async () => {
    mock(() => json({}, 401))
    await assert.rejects(fetchUsers(), (error) => error.status === 401)
    assert.equal(expired, 1)
    assert.equal(calls.length, 1)
  })
  it('sadece kendi hesabının oturum etkisini belirler; kullanıcı adını case-sensitive karşılaştırır', () => {
    assert.equal(isCurrentAccount(account(), 'editor'), true)
    assert.equal(isCurrentAccount(account(), 'EDITOR'), false)
    assert.equal(invalidatesUserSession('resend'), false)
    for (const action of ['role', 'active', 'permissions', 'reset', 'revoke']) assert.equal(invalidatesUserSession(action), true)
  })
  it('geçersiz rol, izin veya kullanıcı IDsi için yazma göndermez', async () => {
    mock(() => json(account()))
    await assert.rejects(setUserRole(10, 'ROLE_ADMIN'), /rol/)
    await assert.rejects(setUserPermissions(10, ['UNKNOWN']), /izni/)
    await assert.rejects(setUserActive(-1, false), /ID/)
    assert.equal(calls.length, 0)
  })
})

describe('Tek kullanımlık hesap bağlantısı', () => {
  it('fragmentı ayrıştırıp URLden temizler; tokenı history stateine veya queryye koymaz', () => {
    const historyCalls = []
    const result = parseAccountFragment({ pathname: '/account/action', hash: '#purpose=INVITATION&token=a%2Bb%2Fc%3D' }, { replaceState: (...args) => historyCalls.push(args) })
    assert.deepEqual(result, { purpose: 'INVITATION', token: 'a+b/c=' })
    assert.deepEqual(historyCalls, [[null, '', '/account/action']])
    assert.equal(calls.length, 0)
  })
  it('eksik, boş, tekrar eden veya bilinmeyen amaçlı bağlantıları reddeder; yine de fragmentı temizler', () => {
    let cleaned = 0
    for (const hash of ['', '#token=t', '#purpose=EMAIL_CHANGE&token=', '#purpose=EMAIL_CHANGE&token=%20', '#purpose=UNKNOWN&token=t', '#purpose=INVITATION&purpose=PASSWORD_RESET&token=t', '#purpose=INVITATION&token=a&token=b']) {
      assert.equal(parseAccountFragment({ pathname: '/account/action', hash }, { replaceState: () => { cleaned += 1 } }), null)
    }
    assert.equal(cleaned, 7)
  })
  it('başka rotanın fragmentına dokunmaz', () => {
    assert.equal(parseAccountFragment({ pathname: '/', hash: '#section' }, { replaceState: () => assert.fail('başka rota değiştirilmemeli') }), null)
  })
  it('eski isteğin tamamlanması daha sonra açılan yeni tokenı temizleyemez', () => {
    captureAccountLink({ pathname: '/account/action', hash: '#purpose=INVITATION&token=older' }, { replaceState: () => {} })
    const oldNonce = getAccountLink().nonce
    captureAccountLink({ pathname: '/account/action', hash: '#purpose=EMAIL_CHANGE&token=newer' }, { replaceState: () => {} })
    assert.equal(clearAccountLink(oldNonce), false)
    assert.equal(getAccountLink().token, 'newer')
    assert.equal(clearAccountLink(getAccountLink().nonce), true)
    assert.equal(getAccountLink(), null)
  })
  it('React tekrar okusa da bağlantıyı tüketmez; açık temizlemede token bellekte tutulmaz', () => {
    captureAccountLink({ pathname: '/account/action', hash: '#purpose=PASSWORD_RESET&token=memory-only' }, { replaceState: () => {} })
    const first = getAccountLink()
    assert.equal(getAccountLink(), first)
    assert.equal(first.token, 'memory-only')
    assert.equal(calls.length, 0)
    clearAccountLink()
    assert.equal(getAccountLink(), null)
  })
  it('yeni bağlantı eski tokenın yerini alır; nonce token içermez', () => {
    captureAccountLink({ pathname: '/account/action', hash: '#purpose=INVITATION&token=old-token' }, { replaceState: () => {} })
    const nonce = getAccountLink().nonce
    captureAccountLink({ pathname: '/account/action', hash: '#purpose=EMAIL_CHANGE&token=new-token' }, { replaceState: () => {} })
    assert.equal(getAccountLink().token, 'new-token')
    assert.equal(getAccountLink().purpose, 'EMAIL_CHANGE')
    assert.ok(getAccountLink().nonce > nonce)
  })
  it('davet ve reseti sadece kullanıcı eylemindeki POSTla tüketir; token URLye girmez', async () => {
    mock(() => new Response(null, { status: 204 }))
    await completeAccountAction({ purpose: 'INVITATION', token: 'invite-token' }, password, password)
    await completeAccountAction({ purpose: 'PASSWORD_RESET', token: 'reset-token' }, password, password)
    const writes = calls.filter((call) => call.method === 'POST')
    assert.deepEqual(writes.map((call) => call.url), ['/api/v1/auth/invitations/accept', '/api/v1/auth/password-reset/confirm'])
    assert.deepEqual(writes.map((call) => JSON.parse(call.body)), [{ token: 'invite-token', newPassword: password }, { token: 'reset-token', newPassword: password }])
    assert.ok(calls.every((call) => !/invite-token|reset-token/.test(call.url)))
    assert.ok(calls.every((call) => !/login|logout/.test(call.url)))
    assert.ok(writes.every((call) => new Headers(call.headers).get('X-CSRF-TOKEN') === 'account-test'))
  })
  it('e-posta onayında yalnızca token gönderir; parola veya adres eklemez', async () => {
    mock(() => new Response(null, { status: 204 }))
    await completeAccountAction({ purpose: 'EMAIL_CHANGE', token: 'email-token' }, '', '')
    assert.equal(calls.at(-1).url, '/api/v1/auth/email/confirm')
    assert.deepEqual(JSON.parse(calls.at(-1).body), { token: 'email-token' })
  })
  it('süresi dolmuş/kullanılmış tokenın 400 yanıtını tekrar göndermez', async () => {
    mock(() => json({ message: 'Expired or used token' }, 400))
    await assert.rejects(completeAccountAction({ purpose: 'INVITATION', token: 'test' }, password, password), (error) => error.status === 400)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('boş token veya farklı parola tekrarında ağa çıkmaz', async () => {
    mock(() => new Response(null, { status: 204 }))
    await assert.rejects(completeAccountAction({ purpose: 'INVITATION', token: '' }, password, password), /bağlantısı/)
    await assert.rejects(completeAccountAction({ purpose: 'PASSWORD_RESET', token: 'test' }, password, 'different-password'), /eşleşmiyor/)
    assert.equal(calls.length, 0)
  })
})

describe('Profil, parola ve kimlik değişikliği', () => {
  it('parola unutma 202 yanıtında hesaba göre değişebilen gövdeyi döndürmez', async () => {
    mock(() => json({ message: 'account-specific-content-must-not-show' }, 202))
    assert.equal(await requestPasswordReset(' USER@Example.Test '), undefined)
    assert.deepEqual(JSON.parse(calls.at(-1).body), { email: 'user@example.test' })
    assert.ok(!resetRequestMessage.includes('account-specific'))
    mock(() => new Response(null, { status: 202 }))
    assert.equal(await requestPasswordReset('other@example.test'), undefined)
  })
  it('parola değişiminde mevcut/yeni parolayı gönderir; whitespacei sessizce kırpmaz', async () => {
    mock(() => new Response(null, { status: 204 }))
    await changePassword('old-password-123', password, password)
    assert.equal(calls.at(-1).url, '/api/v1/auth/password/change')
    assert.deepEqual(JSON.parse(calls.at(-1).body), { currentPassword: 'old-password-123', newPassword: password })
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('e-posta bağlama/değişimi mevcut parola ile normalleştirilmiş adresi gönderir', async () => {
    mock(() => new Response(null, { status: 202 }))
    await changeEmail('old-password-123', ' New@Example.Test ')
    assert.deepEqual(JSON.parse(calls.at(-1).body), { currentPassword: 'old-password-123', email: 'new@example.test' })
    assert.equal(calls.at(-1).url, '/api/v1/auth/email/change')
    assert.equal(calls.filter((call) => call.url.endsWith('/auth/email/confirm')).length, 0)
  })
  it('mevcut parolanın yanlış olmasıyla oturum bitmesini ayrı ele alır', async () => {
    mock((url) => url.endsWith('/auth/me') ? json(profile()) : json({ message: 'Wrong current password' }, 401))
    await assert.rejects(changePassword('wrong-password', password, password), (error) => error.status === 401)
    assert.equal(expired, 0)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
    mock(() => json({}, 401))
    await assert.rejects(changePassword('old-password', password, password), (error) => error.status === 401)
    assert.equal(expired, 1)
  })
  it('e-postasız bootstrap profilini destekler ve DTO dışı secret alanlarını çıkarır', async () => {
    mock(() => json(profile({ password: 'unexpected', authCredentials: { key: 'unexpected' } })))
    const result = await getProfile()
    assert.equal(result.email, null)
    assert.deepEqual(result.authorities, ['ROLE_ADMIN'])
    assert.equal(Object.hasOwn(result, 'password'), false)
    assert.equal(Object.hasOwn(result, 'authCredentials'), false)
  })
  it('bozuk veya bilinmeyen izinli profili uygulamaya oturum olarak vermez', async () => {
    mock(() => json(profile({ permissions: ['UNRECOGNIZED'] })))
    await assert.rejects(getProfile(), ApiError)
  })
  it('login ile kimlik değişikliğini eşzamanlı başlatmaz; bekleyen işlem bitince kilit açılır', async () => {
    let finish
    mock((url) => {
      if (url.endsWith('/auth/password/change')) return new Promise((resolve) => { finish = resolve })
      if (url.endsWith('/auth/me')) return json(profile())
      return new Response(null, { status: 200 })
    })
    const changing = changePassword('old-password', password, password)
    while (!finish) await Promise.resolve()
    await assert.rejects(login('admin', 'other-password'), (error) => error.status === 409)
    assert.equal(calls.filter((call) => call.url.endsWith('/auth/login')).length, 0)
    finish(new Response(null, { status: 204 })); await changing
    assert.equal((await login('admin', 'other-password')).username, 'admin')
  })
  it('parola politikasını ve mevcut paroladan farklı olma kuralını yazmadan önce kontrol eder', async () => {
    mock(() => new Response(null, { status: 204 }))
    for (const value of ['short', ' '.repeat(12), 'x'.repeat(129)]) assert.throws(() => validateNewPassword(value, value))
    await assert.rejects(changePassword(password, password, password), /farklı/)
    assert.equal(calls.length, 0)
  })
  it('kullanıcı adı, rol ve e-posta girdilerini doğrular; izinleri birbirine eklemez', () => {
    assert.equal(normalizeEmail('USER@EXAMPLE.TEST'), 'user@example.test')
    assert.throws(() => invitationInput({ username: 'has space', email: 'a@b.test', role: 'VIEWER' }))
    assert.throws(() => invitationInput({ username: 'valid', email: 'invalid', role: 'VIEWER' }))
    assert.throws(() => invitationInput({ username: 'valid', email: 'a@b.test', role: 'ROLE_EDITOR' }))
    assert.deepEqual(permissionInput(['MANAGE_CREDENTIALS', 'MANAGE_CREDENTIALS']), ['MANAGE_CREDENTIALS'])
    assert.deepEqual(permissionInput([]), [])
  })
})

describe('Doğrudan rota ve hesap hataları', () => {
  it('sayfa açılışında tokenı temizler, rota değişince bellekten atar ve geri tuşunda geri üretmez', async () => {
    const { initializeNavigation, navigateRoute, getPath } = await import('../src/lib/navigation.ts')
    const browser = new EventTarget()
    const location = { pathname: '/account/action', hash: '#purpose=INVITATION&token=route-token', search: '?tracking=1' }
    const move = (path) => { const url = new URL(path, 'https://app.example.test'); Object.assign(location, { pathname: url.pathname, hash: url.hash, search: url.search }) }
    browser.location = location
    browser.history = { replaceState: (state, title, path) => { assert.equal(state, null); move(path) }, pushState: (state, title, path) => move(path) }
    browser.scrollTo = () => {}
    globalThis.window = browser
    const dispose = initializeNavigation()
    try {
      assert.equal(getAccountLink().token, 'route-token')
      assert.equal(location.hash, '')
      assert.equal(location.search, '')
      navigateRoute('/login')
      assert.equal(getPath(), '/login')
      assert.equal(getAccountLink(), null)
      move('/account/action')
      browser.dispatchEvent(new Event('popstate'))
      assert.equal(getAccountLink(), null)
    } finally { dispose() }
    assert.equal(calls.length, 0)
  })
  it('açık hesap sayfasına yeni fragment gelirse bellekteki bağlantıyı yeniler ve URLden temizler', async () => {
    const { initializeNavigation } = await import('../src/lib/navigation.ts')
    const browser = new EventTarget()
    browser.location = { pathname: '/account/action', hash: '', search: '' }
    browser.history = { replaceState: () => { browser.location.hash = '' } }
    globalThis.window = browser
    const dispose = initializeNavigation()
    try {
      browser.location.hash = '#purpose=EMAIL_CHANGE&token=new-route-token'
      browser.dispatchEvent(new Event('hashchange'))
      assert.equal(getAccountLink().purpose, 'EMAIL_CHANGE')
      assert.equal(getAccountLink().token, 'new-route-token')
      assert.equal(browser.location.hash, '')
    } finally { dispose() }
    assert.equal(calls.length, 0)
  })
  it('sunucu yanlışlıkla tokenı hataya eklese de ekrana taşınacak mesajı temizler', async () => {
    mock(() => json({ message: 'Invalid secret-test-token', details: ['Expired secret-test-token'] }, 400))
    await assert.rejects(completeAccountAction({ purpose: 'EMAIL_CHANGE', token: 'secret-test-token' }, '', ''), (error) => {
      assert.equal(error.status, 400)
      assert.ok(!error.message.includes('secret-test-token'))
      assert.ok(error.details.every((detail) => !detail.includes('secret-test-token')))
      return true
    })
  })
  it('başarılı yazmada bozuk kullanıcı DTOsu gelirse sonucu belirsiz hata olarak döndürür', async () => {
    mock(() => new Response(null, { status: 201 }))
    await assert.rejects(inviteUser({ username: 'new', email: 'new@example.test', role: 'VIEWER' }), (error) => error instanceof ApiError && error.status === 0)
    assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  })
  it('429 Retry-After boyunca hesap POSTunu tekrar göndermez', async () => {
    mock(() => json({ message: 'Rate limited' }, 429, { 'Retry-After': '60' }))
    await assert.rejects(requestPasswordReset('a@example.test'), (error) => error.status === 429 && error.retryAt > Date.now())
    const count = calls.length
    await assert.rejects(requestPasswordReset('b@example.test'), (error) => error.status === 429)
    assert.equal(calls.length, count)
  })
})

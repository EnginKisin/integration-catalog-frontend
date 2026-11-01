import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const account = (changes = {}) => ({ id: 2, username: 'alice', email: 'alice@example.test', emailVerified: true, active: true, passwordResetRequired: false, role: 'EDITOR', permissions: ['VIEW_CREDENTIALS'], ...changes })
const defaultUsers = () => [
  account({ id: 1, username: 'test-user', role: 'ADMIN', email: null, emailVerified: false, permissions: [] }),
  account(),
  account({ id: 3, username: 'bob', email: 'bob@example.test', emailVerified: false, active: false, passwordResetRequired: true, role: 'VIEWER', permissions: [] }),
]

async function setup(page, users = defaultUsers()) {
  const state = await mockCatalog(page)
  state.users = users
  await page.route('**/api/v1/users**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const method = request.method()
    const body = request.postDataJSON()
    state.calls.push({ path, method, body, query: url.search })
    const failureKey = `${method} ${path}`
    if (state.failures.has(failureKey)) {
      const status = state.failures.get(failureKey)
      state.failures.delete(failureKey)
      return route.fulfill({ status, json: { code: 'LAST_ADMIN_REQUIRED', message: 'The last active administrator must be retained' } })
    }
    if (path === '/users/mail-status') return route.fulfill({ json: { pending: 2, failed: 1 } })
    if (path === '/users' && method === 'GET') {
      const page = Number(url.searchParams.get('page'))
      const size = Number(url.searchParams.get('size'))
      return route.fulfill({ json: { items: state.users.slice(page * size, (page + 1) * size), page, size, totalElements: state.users.length, totalPages: Math.ceil(state.users.length / size) } })
    }
    if (path === '/users' && method === 'POST') {
      const created = account({ ...body, id: 100, emailVerified: false, active: false, permissions: [] })
      state.users.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    const match = path.match(/^\/users\/(\d+)\/(role|permissions|active|sessions\/revoke)$/)
    if (match) {
      const index = state.users.findIndex((user) => user.id === Number(match[1]))
      if (match[2] === 'sessions/revoke') return route.fulfill({ status: 204 })
      state.users[index] = { ...state.users[index], ...body }
      return route.fulfill({ json: state.users[index] })
    }
    return route.fulfill({ status: 500, json: { message: `Beklenmeyen kullanıcı isteği: ${path}` } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Entegrasyonlar', exact: true })).toBeVisible()
  const mobileMenu = page.getByRole('button', { name: 'Menü', exact: true })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Kullanıcılar', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  return state
}

test('kullanıcıları tabloda gösterir; menüden rol değiştirirken hatayı pencerede gösterir', async ({ page }, testInfo) => {
  const state = await setup(page)
  await expect(page.getByRole('columnheader')).toHaveText(['Kullanıcı', 'E-posta', 'Rol', 'Hesap durumu', 'Erişim izinleri', 'İşlemler'])
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.getByRole('button', { name: 'test-user işlemleri', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Daveti yeniden gönder/ })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: /Zorunlu parola sıfırlama/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'test-user işlemleri', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'alice işlemleri', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rolü değiştir', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Rolü değiştir', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true })).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Rol', exact: true }).selectOption('VIEWER')
  state.failures.set('PUT /users/2/role', 409)
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Son aktif yöneticinin erişimi kaldırılamaz.')
  await expect(dialog.getByRole('combobox', { name: 'Rol', exact: true })).toHaveValue('VIEWER')
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('tbody tr').filter({ hasText: 'alice' }).getByText('Görüntüleyici', { exact: true })).toBeVisible()
  expect(state.calls.filter((call) => call.path === '/users/2/role' && call.method === 'PUT')).toHaveLength(2)
  await page.screenshot({ path: testInfo.outputPath('users-desktop.png'), fullPage: true })
})

test('sayfalama ve davet penceresi çalışır; aktifleştirme onay verilene kadar istek göndermez', async ({ page }) => {
  const state = await setup(page, Array.from({ length: 23 }, (_, index) => account({ id: index + 1, username: `user-${index + 1}`, email: `user${index + 1}@example.test` })))
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await page.getByRole('button', { name: 'Sonraki sayfa', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Sayfa başına', exact: true }).selectOption('50')
  await expect(page.locator('tbody tr')).toHaveCount(23)
  await page.getByRole('button', { name: 'Kullanıcı davet et', exact: true }).click()
  const invite = page.getByRole('dialog', { name: 'Yeni kullanıcı daveti', exact: true })
  await invite.getByRole('textbox', { name: 'Kullanıcı adı', exact: true }).fill('new-user')
  await invite.getByRole('textbox', { name: 'E-posta', exact: true }).fill('new@example.test')
  await invite.getByRole('button', { name: 'Davet oluştur', exact: true }).click()
  await expect(invite).not.toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(24)
  await page.getByRole('button', { name: 'new-user işlemleri', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Daveti yeniden gönder', exact: true })).toBeEnabled()
  await page.getByRole('menuitem', { name: 'Aktifleştir', exact: true }).click()
  const activation = page.getByRole('dialog', { name: 'Kullanıcıyı aktifleştir', exact: true })
  await expect(activation).toBeVisible()
  expect(state.calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/active'))).toHaveLength(0)
  await activation.getByRole('button', { name: 'Aktifleştir', exact: true }).click()
  await expect(activation).not.toBeVisible()
  await expect(page.locator('tbody tr').filter({ hasText: 'new-user' }).getByText('Aktif', { exact: true })).toBeVisible()
  expect(state.calls.find((call) => call.method === 'PUT' && call.path === '/users/100/active').body).toEqual({ active: true })
})

test('kendi hesabının oturumlarını kapatınca yeniden girişe yönlendirir', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'test-user işlemleri', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Oturumları kapat', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Oturumları kapat', exact: true })
  await expect(dialog).toContainText('kendi hesabınızın oturumunu')
  await dialog.getByRole('button', { name: 'Oturumları kapat', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(state.calls.filter((call) => call.method === 'POST' && call.path === '/users/1/sessions/revoke')).toHaveLength(1)
})

test('mobilde tablo yatay kayar; işlem menüsü ve davet penceresi ekranda kalır', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'bob işlemleri', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'bob işlemleri', exact: true })
  await expect(menu).toBeVisible()
  const bounds = await menu.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await page.getByRole('menuitem', { name: 'Daveti yeniden gönder', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Daveti yeniden gönder', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('users-mobile-dialog.png'), fullPage: true })
})

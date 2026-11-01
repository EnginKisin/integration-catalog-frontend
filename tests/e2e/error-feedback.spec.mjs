import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const requestId = '8e602015-ea22-4a62-bc33-cda40345b09d'
const failure = (code, status, violations = []) => ({ timestamp: '2026-11-01T10:00:00Z', status, error: 'Error', code, message: 'English backend fallback must not appear', details: ['private fallback detail'], path: '/api/v1/test', requestId, violations, params: {} })

test('giriş hatasını Türkçe gösterir ve destek numarasını korur', async ({ page }) => {
  const state = await mockCatalog(page)
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: failure('AUTH_REQUIRED', 401) }))
  await page.route('**/api/v1/auth/login', (route) => { state.calls.push({ path: '/auth/login', method: 'POST' }); return route.fulfill({ status: 401, json: failure('INVALID_CREDENTIALS', 401) }) })
  await page.goto('/login')
  await page.getByLabel('Kullanıcı adı', { exact: true }).fill('test-user')
  await page.getByLabel('Parola', { exact: true }).fill('wrong-test-password')
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Kullanıcı adı veya parola hatalı.')
  await expect(alert).toContainText(requestId)
  await expect(alert).not.toContainText('English backend')
  await expect(alert).not.toContainText('private fallback')
  expect(state.calls.filter((call) => call.path === '/auth/login')).toHaveLength(1)
})

for (const width of [1440, 390]) {
  test(`${width}px: alan hatasını input altında gösterir; düzenlendiğinde temizler`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await mockCatalog(page)
    await page.route('**/api/v1/auth/password/change', (route) => route.fulfill({ status: 400, json: failure('CURRENT_PASSWORD_INVALID', 400, [{ field: 'currentPassword', code: 'CURRENT_PASSWORD_INVALID', params: {} }]) }))
    await page.goto('/')
    const menu = page.getByRole('button', { name: 'Menü', exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Hesabım', exact: true }).click()
    const current = page.getByLabel('Mevcut parola', { exact: true })
    await current.fill('wrong-current-password')
    await page.getByLabel('Yeni parola', { exact: true }).fill('new-test-password-2026')
    await page.getByLabel('Yeni parola tekrar', { exact: true }).fill('new-test-password-2026')
    await page.getByRole('button', { name: 'Parolayı değiştir', exact: true }).click()
    await expect(current).toHaveAttribute('aria-invalid', 'true')
    const descriptionId = await current.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    await expect(page.locator(`[id="${descriptionId}"]`)).toHaveText('Mevcut parola hatalı.')
    await expect(page.getByRole('alert')).toContainText(requestId)
    await page.screenshot({ path: testInfo.outputPath(`field-error-${width}.png`), fullPage: true })
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    expect(fits).toBeTruthy()
    await current.fill('corrected-current-password')
    await expect(current).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator(`[id="${descriptionId}"]`)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Hesabım', exact: true })).toBeVisible()
  })
}

test('bilinmeyen hata kodunda ham sunucu metni yerine Türkçe yedek gösterir', async ({ page }) => {
  await mockCatalog(page)
  const body = failure('FUTURE_ERROR_CODE', 422)
  delete body.requestId
  await page.route('**/api/v1/integrations', (route) => route.fulfill({ status: 422, headers: { 'X-Request-ID': requestId }, json: body }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('İçerik veya alan seçimlerini kontrol edin.')
  await expect(page.getByRole('alert')).toContainText(requestId)
  await expect(page.getByRole('alert')).not.toContainText('English backend')
})

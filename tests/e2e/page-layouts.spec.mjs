import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const profile = { username: 'test-user', email: 'team@example.test', emailVerified: true, active: true, authorities: ['ROLE_ADMIN'], permissions: [] }
const layouts = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]
const fits = async (page) => {
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
}
async function navigate(page, name) {
  const toggle = page.getByRole('button', { name: 'Menü', exact: true })
  if (await toggle.isVisible()) await toggle.click()
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name, exact: true }).click()
}

for (const layout of layouts) {
  test(`${layout.name}: katalog, sistemler ve hesap ekranında gezinir; e-posta değişikliğini gönderir`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    await mockCatalog(page, { item: { description: 'Sipariş bilgilerinin sistemler arasında aktarımı.' } })
    let emailRequest
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: profile }))
    await page.route('**/api/v1/auth/email/change', (route) => {
      emailRequest = route.request().postDataJSON()
      return route.fulfill({ status: 202 })
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Entegrasyonlar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true })
    await page.getByRole('searchbox', { name: 'Entegrasyon ara', exact: true }).fill('bulunmayan servis')
    await expect(page.getByRole('heading', { name: 'Aramanıza uygun entegrasyon bulunamadı', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click()
    await navigate(page, 'Sistemler')
    await expect(page.getByRole('region', { name: 'Sistem listesi', exact: true })).toBeVisible()
    await fits(page)
    await navigate(page, 'Hesabım')
    await expect(page.getByRole('heading', { name: 'Hesabım', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Hesap bilgileri', exact: true })).toContainText('team@example.test')
    await fits(page)
    await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true })
    await page.getByRole('button', { name: 'E-posta bağla / değiştir', exact: true }).click()
    await page.getByLabel('Mevcut parola', { exact: true }).fill('existing-test-password')
    await page.getByLabel('Yeni e-posta', { exact: true }).fill('next@example.test')
    await page.getByRole('button', { name: 'Doğrulama bağlantısı iste', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Doğrulama isteği alındı.')
    expect(emailRequest).toEqual({ currentPassword: 'existing-test-password', email: 'next@example.test' })
  })

  test(`${layout.name}: giriş ve parola kurtarma formları çalışır ve ekrana sığar`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    await mockCatalog(page)
    let signedIn = false
    let resetRequest
    let loginRequest
    await page.route('**/api/v1/auth/me', (route) => signedIn ? route.fulfill({ json: profile }) : route.fulfill({ status: 401, json: { message: 'Oturum gerekli.' } }))
    await page.route('**/api/v1/auth/login', (route) => {
      loginRequest = Object.fromEntries(new URLSearchParams(route.request().postData()))
      signedIn = true
      return route.fulfill({ status: 204 })
    })
    await page.route('**/api/v1/auth/password-reset/request', (route) => {
      resetRequest = route.request().postDataJSON()
      return route.fulfill({ status: 202 })
    })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Entegrasyon Kataloğu', exact: true })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
    await page.getByRole('button', { name: 'Parolamı unuttum', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Parolamı unuttum', exact: true })).toBeVisible()
    await fits(page)
    await page.screenshot({ path: testInfo.outputPath('forgot-password.png'), fullPage: true })
    await page.getByLabel('E-posta', { exact: true }).fill('team@example.test')
    await page.getByRole('button', { name: 'Sıfırlama bağlantısı iste', exact: true }).click()
    await expect(page.getByRole('status')).toBeVisible()
    expect(resetRequest).toEqual({ email: 'team@example.test' })
    await page.getByRole('button', { name: 'Giriş ekranına dön', exact: true }).click()
    await page.getByLabel('Kullanıcı adı', { exact: true }).fill('test-user')
    await page.getByLabel('Parola', { exact: true }).fill('test-login-password')
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Entegrasyonlar', exact: true })).toBeVisible()
    expect(loginRequest).toEqual({ username: 'test-user', password: 'test-login-password' })
  })

  test(`${layout.name}: davet, parola ve e-posta onayları kullanıcı eylemiyle tamamlanır`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    await mockCatalog(page)
    const requests = []
    for (const endpoint of ['invitations/accept', 'password-reset/confirm', 'email/confirm']) {
      await page.route(`**/api/v1/auth/${endpoint}`, (route) => {
        requests.push({ endpoint, body: route.request().postDataJSON() })
        return route.fulfill({ status: 204 })
      })
    }
    for (const [index, purpose] of ['INVITATION', 'PASSWORD_RESET', 'EMAIL_CHANGE'].entries()) {
      await page.goto(`/account/action#purpose=${purpose}&token=layout-test-${index}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(purpose === 'INVITATION' ? 'Daveti kabul et' : purpose === 'PASSWORD_RESET' ? 'Yeni parola belirle' : 'E-posta adresini doğrula')
      await expect(page).toHaveURL(/\/account\/action$/)
      await fits(page)
      expect(requests).toHaveLength(index)
      if (purpose !== 'EMAIL_CHANGE') {
        await page.getByLabel('Yeni parola', { exact: true }).fill('new-layout-test-password')
        await page.getByLabel('Yeni parola tekrar', { exact: true }).fill('new-layout-test-password')
      }
      await page.screenshot({ path: testInfo.outputPath(`account-${purpose.toLowerCase()}.png`), fullPage: true })
      await page.getByRole('button', { name: purpose === 'EMAIL_CHANGE' ? 'Yeni adresi onayla' : 'Yeni parolayı kaydet', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('Hesap işlemi tamamlandı.')
      expect(requests[index].body).toEqual({ token: `layout-test-${index}`, ...(purpose !== 'EMAIL_CHANGE' ? { newPassword: 'new-layout-test-password' } : {}) })
    }
  })
}

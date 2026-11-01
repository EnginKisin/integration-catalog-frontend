import { test, expect } from '@playwright/test'
import { mockCatalog } from './mock-api.mjs'

const menu = (page) => page.getByRole('navigation', { name: 'Ana menü' })
const steps = (page) => page.getByRole('navigation', { name: 'Entegrasyon adımları' })
const choice = (page, name) => page.getByRole('combobox', { name, exact: true })
const writes = (state) => state.calls.filter((call) => call.method !== 'GET')
const row = (page, name) => page.getByRole('row').filter({ has: page.getByRole('button', { name: `${name} ayrıntılarını aç`, exact: true }) })
async function openSystems(page, options) {
  const state = await mockCatalog(page, options)
  await page.goto('/')
  await menu(page).getByRole('button', { name: 'Sistemler', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sistemler', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Sistem listesi', exact: true })).toBeVisible()
  return state
}
async function start(page) {
  await page.getByRole('main').getByRole('button', { name: 'Yeni entegrasyon', exact: true }).click()
  await page.getByLabel('Servis adı', { exact: true }).fill('Ortak sistemli kayıt')
}

test('aynı ortak sistemi üç rolde seçer ve yalnızca yeni kimlik alanlarını gönderir', async ({ page }) => {
  const state = await mockCatalog(page)
  await page.goto('/')
  await start(page)
  await page.getByRole('checkbox', { name: 'Ara katman kullan', exact: true }).check()
  for (const name of ['Kaynak sistem', 'Hedef sistem', 'Ara katman']) {
    await expect(choice(page, name).getByRole('option')).toHaveCount(4)
    await choice(page, name).selectOption('2')
  }
  await page.getByRole('button', { name: 'Kaydet ve devam et →', exact: true }).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Ortam ayarları')
  const body = writes(state).find((call) => call.path === '/integrations').body
  expect(body).toMatchObject({ sourceSystemId: 2, destinationSystemId: 2, middlewareSystemId: 2, hasMiddleware: true })
  expect(Object.keys(body).sort()).toEqual(['name', 'description', 'sourceSystemId', 'destinationSystemId', 'middlewareSystemId', 'sourcePayloadFormat', 'destinationPayloadFormat', 'isSync', 'hasMiddleware'].sort())
  expect(state.calls.some((call) => /^\/(sources|destinations|middlewares)(\/|$)/.test(call.path))).toBe(false)
})

test('form içinde oluşturulan sistem bütün rol listelerine eklenir ve form girdileri korunur', async ({ page }) => {
  const state = await mockCatalog(page)
  await page.goto('/')
  await start(page)
  await page.getByRole('textbox', { name: 'Açıklama (isteğe bağlı)', exact: true }).fill('Korunacak açıklama')
  await page.getByRole('button', { name: '+ Yeni sistem ekle', exact: true }).first().click()
  await page.getByRole('dialog').getByLabel('Sistem adı', { exact: true }).fill('Yeni SAP')
  await page.getByRole('dialog').getByRole('button', { name: 'Ekle ve seç', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const created = state.systems.find((system) => system.name === 'Yeni SAP')
  await expect(choice(page, 'Kaynak sistem')).toHaveValue(String(created.id))
  await expect(page.getByLabel('Servis adı', { exact: true })).toHaveValue('Ortak sistemli kayıt')
  await expect(page.getByRole('textbox', { name: 'Açıklama (isteğe bağlı)', exact: true })).toHaveValue('Korunacak açıklama')
  await choice(page, 'Hedef sistem').selectOption(String(created.id))
  await page.getByRole('checkbox', { name: 'Ara katman kullan', exact: true }).check()
  await choice(page, 'Ara katman').selectOption(String(created.id))
  await page.getByRole('button', { name: 'Kaydet ve devam et →', exact: true }).click()
  await expect(steps(page).locator('[aria-current="step"]')).toContainText('Ortam ayarları')
  expect(writes(state).map(({ path }) => path)).toEqual(['/systems', '/integrations'])
})

test('pasif mevcut sistemleri sadece kayıtlı rollerinde korur; güncellemede aynı kimlikleri gönderir', async ({ page }) => {
  const systems = [{ id: 1, name: 'Eski ERP', description: '', active: false, usageCount: 1 }, { id: 2, name: 'CRM', description: '', active: true, usageCount: 1 }, { id: 3, name: 'Eski ESB', description: '', active: false, usageCount: 1 }]
  const state = await mockCatalog(page, { systems, item: { hasMiddleware: true, middlewareSystemId: 3 } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sipariş aktarımı ayrıntılarını aç', exact: true }).click()
  await steps(page).getByRole('button', { name: /Temel bilgiler/ }).click()
  await expect(choice(page, 'Kaynak sistem')).toHaveValue('1')
  await expect(choice(page, 'Kaynak sistem').getByRole('option', { name: /Eski ERP.*Pasif, mevcut seçim/ })).toHaveCount(1)
  await expect(choice(page, 'Kaynak sistem').getByRole('option', { name: /Eski ESB/ })).toHaveCount(0)
  await expect(choice(page, 'Hedef sistem').getByRole('option', { name: /Eski ERP|Eski ESB/ })).toHaveCount(0)
  await expect(choice(page, 'Ara katman')).toHaveValue('3')
  await expect(choice(page, 'Ara katman').getByRole('option', { name: /Eski ERP/ })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Açıklama (isteğe bağlı)', exact: true }).fill('Yeni açıklama')
  await page.getByRole('button', { name: 'Kaydet ve çık', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Entegrasyonlar', exact: true })).toBeVisible()
  expect(writes(state).find((call) => call.method === 'PUT').body).toMatchObject({ sourceSystemId: 1, destinationSystemId: 2, middlewareSystemId: 3 })
  expect(state.calls.filter((call) => call.path === '/systems/1' && call.method === 'GET')).toHaveLength(1)
  expect(state.calls.filter((call) => call.path === '/systems/3' && call.method === 'GET')).toHaveLength(1)
})

test('tek katalogda oluşturur, günceller, pasifleştirir ve kullanılmayan sistemi siler', async ({ page }, testInfo) => {
  const state = await openSystems(page, { item: { sourceSystemId: 1, destinationSystemId: 1, middlewareSystemId: 1, hasMiddleware: true } })
  await expect(page.getByRole('navigation', { name: 'Tanım türü', exact: true })).toHaveCount(0)
  await expect(row(page, 'ERP')).toContainText('1 entegrasyon')
  await row(page, 'ERP').getByRole('button', { name: 'ERP işlemleri', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /^Sil/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Yeni sistem', exact: true }).click()
  await page.getByRole('dialog').getByLabel('İsim', { exact: true }).fill('Depo')
  await page.getByRole('dialog').getByRole('button', { name: 'Sistem ekle', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await row(page, 'Depo').getByRole('button', { name: 'Depo ayrıntılarını aç', exact: true }).click()
  await page.getByRole('dialog').getByLabel('İsim', { exact: true }).fill('Yeni Depo')
  await page.getByRole('dialog').getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await row(page, 'Yeni Depo').getByRole('button', { name: 'Yeni Depo işlemleri', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Pasifleştir', exact: true }).click()
  await expect(row(page, 'Yeni Depo')).toContainText('Pasif')
  await page.screenshot({ path: testInfo.outputPath('systems-desktop.png'), fullPage: true })
  await row(page, 'Yeni Depo').getByRole('button', { name: 'Yeni Depo işlemleri', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Sil', exact: true }).click()
  await expect(row(page, 'Yeni Depo')).toHaveCount(0)
  expect(writes(state).map(({ method, path }) => `${method} ${path}`)).toEqual(['POST /systems', 'PUT /systems/4', 'PATCH /systems/4/active', 'DELETE /systems/4'])
})

for (const role of ['EDITOR', 'VIEWER']) test(`${role} sistem yönetiminde kendi yetkilerini görür`, async ({ page }) => {
  const state = await openSystems(page, { role })
  if (role === 'VIEWER') {
    await expect(page.getByRole('button', { name: 'Yeni sistem', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ERP işlemleri', exact: true })).toHaveCount(0)
    await row(page, 'ERP').getByRole('button', { name: 'ERP ayrıntılarını aç', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Sistem ayrıntısı')
    await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0)
  } else {
    await expect(page.getByRole('button', { name: 'Yeni sistem', exact: true })).toBeEnabled()
    await row(page, 'ERP').getByRole('button', { name: 'ERP işlemleri', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Sil', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Düzenle', exact: true })).toBeEnabled()
  }
  expect(writes(state)).toHaveLength(0)
})

test('silme sırasında kullanım değişirse 409u gösterir, listeyi yeniler ve isteği tekrarlamaz', async ({ page }) => {
  const state = await openSystems(page, { item: {} })
  state.record.destinationSystemId = 3
  await row(page, 'ESB').getByRole('button', { name: 'ESB işlemleri', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Sil', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sistem entegrasyonlarda kullanılıyor.')
  await expect(row(page, 'ESB')).toContainText('1 entegrasyon')
  expect(writes(state)).toHaveLength(1)
  await row(page, 'ESB').getByRole('button', { name: 'ESB işlemleri', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /^Sil/ })).toBeDisabled()
})

test('mobil sistem listesi ve oluşturma penceresi sayfayı yatay taşırmaz', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCatalog(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Menü', exact: true }).click()
  await menu(page).getByRole('button', { name: 'Sistemler', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Sistem listesi', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Yeni sistem', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('systems-mobile.png'), fullPage: true })
})

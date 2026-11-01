import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mockCatalog } from './mock-api.mjs'

const base = { id: 30, name: 'Sipariş aktarımı', description: 'Sipariş bilgilerinin aktarımı.', sourceSystemId: 1, sourceSystemName: 'ERP', destinationSystemId: 2, destinationSystemName: 'CRM', middlewareSystemId: 3, middlewareSystemName: 'ESB', hasMiddleware: true, isSync: true, sourcePayloadFormat: 'JSON', destinationPayloadFormat: 'XML', status: 'DRAFT', reviewRequired: false, environmentTypes: ['TEST'], updatedAt: '2026-10-31T18:00:00' }
const records = [base,
  { ...base, id: 31, name: 'Stok sorgulama', destinationSystemId: 4, destinationSystemName: 'Depo', middlewareSystemId: null, middlewareSystemName: null, hasMiddleware: false, isSync: false, status: 'COMPLETED', environmentTypes: ['PROD'] },
  { ...base, id: 32, name: 'Müşteri aktarımı', sourceSystemId: 5, sourceSystemName: 'CRM', status: 'COMPLETED', environmentTypes: ['DEV'] },
  { ...base, id: 33, name: 'Fiyat güncelleme', middlewareSystemId: null, middlewareSystemName: null, hasMiddleware: false },
  { ...base, id: 34, name: 'Teslimat bildirimi', sourceSystemId: 6, sourceSystemName: 'ERP', middlewareSystemId: 7, middlewareSystemName: 'ESB' },
]

async function setup(page, items = records, role = 'VIEWER') {
  const state = await mockCatalog(page, { role, item: { ...base, destinationPayloadFormat: 'JSON' } })
  await page.route('**/api/v1/integrations', (route) => route.fulfill({ json: items }))
  await page.goto('/')
  if (await page.getByRole('button', { name: 'Menü', exact: true }).isVisible()) await page.getByRole('button', { name: 'Menü', exact: true }).click()
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Akış Haritası', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Akış Haritası', exact: true })).toBeVisible()
  await expect(page.locator('[data-flow-id]')).toHaveCount(items.length)
  return state
}

test('kaynak, hedef, ara katman ve tek entegrasyon filtreleri birlikte çalışır', async ({ page }) => {
  const state = await setup(page)
  await page.getByLabel('Kaynak sistem', { exact: true }).selectOption('1')
  await expect(page.locator('[data-flow-id]')).toHaveCount(3)
  await page.getByLabel('Hedef sistem', { exact: true }).selectOption('2')
  await expect(page.locator('[data-flow-id]')).toHaveCount(2)
  await page.getByLabel('Ara katman', { exact: true }).selectOption('3')
  await expect(page.locator('[data-flow-id]')).toHaveCount(1)
  await page.getByLabel('Entegrasyon', { exact: true }).selectOption('32')
  await expect(page.getByRole('heading', { name: 'Bu filtrelerle eşleşen akış bulunamadı' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).first().click()
  await page.getByLabel('Ara katman', { exact: true }).selectOption('3')
  await expect(page.locator('[data-flow-id]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click()
  await page.getByLabel('Ara katman', { exact: true }).selectOption('none')
  await expect(page.locator('[data-flow-id]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click()
  await page.getByLabel('Kaynak sistem', { exact: true }).selectOption('6')
  await expect(page.locator('[data-flow-id="34"]')).toBeVisible()
  await expect(page.locator('[data-flow-id]')).toHaveCount(1)
  expect(state.calls.every((call) => call.method === 'GET')).toBeTruthy()
})

test('akış seçimi, klavye, yakınlaştırma ve filtreleri koruyarak detaya geçiş çalışır', async ({ page }) => {
  await setup(page)
  const details = page.getByRole('complementary', { name: 'Seçili akış ayrıntıları' })
  await page.locator('[data-flow-id="30"]').focus()
  await page.keyboard.press('Enter')
  await expect(details.getByRole('heading', { name: 'Sipariş aktarımı' })).toBeVisible()
  const oldZoom = await page.getByLabel('Yakınlaştırma oranı').textContent()
  await page.getByRole('button', { name: 'Yakınlaştır', exact: true }).click()
  await expect(page.getByLabel('Yakınlaştırma oranı')).not.toHaveText(oldZoom)
  await page.getByRole('button', { name: 'Sığdır', exact: true }).click()
  await page.getByLabel('Kaynak sistem', { exact: true }).selectOption('1')
  await page.locator('[data-flow-id="30"] text').filter({ hasText: 'Sipariş aktarımı' }).click()
  await details.getByRole('button', { name: 'Entegrasyonu aç', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sipariş aktarımı', exact: true, level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Akış haritasına dön', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Akış Haritası', exact: true })).toBeVisible()
  await expect(page.getByLabel('Kaynak sistem', { exact: true })).toHaveValue('1')
})

test('ortak ara katman ekranda ve tüm çıktılarda tek kutuda kalır', async ({ page }) => {
  const many = Array.from({ length: 13 }, (_, index) => ({ ...base, id: 100 + index, name: `Akış ${String(index).padStart(2, '0')}` }))
  await setup(page, many)
  await expect(page.locator('[data-flow-id]')).toHaveCount(13)
  await expect(page.locator('[data-system-role="middleware"]')).toHaveCount(1)
  await expect(page.locator('[data-system-role="source"]')).toHaveCount(1)
  await expect(page.locator('[data-system-role="destination"]')).toHaveCount(1)
  await page.getByLabel('Haritada akış seç', { exact: true }).selectOption('112')
  await expect(page.locator('[data-flow-id="112"]')).toHaveAttribute('aria-pressed', 'true')
  let pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'SVG', exact: true }).click()
  let file = await pending
  const svg = await readFile(await file.path(), 'utf8')
  expect(svg).toContain('Akış 12')
  expect(svg).toContain('Tüm entegrasyonlar')
  expect(svg).not.toContain('data-flow-id=')
  expect(svg.match(/data-system-role="middleware"/g)).toHaveLength(1)
  await page.getByLabel('Entegrasyon', { exact: true }).selectOption('112')
  pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PNG', exact: true }).click()
  file = await pending
  const png = await readFile(await file.path())
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBe(2000)
  await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).click()
  await page.addInitScript(() => { window.print = () => {} })
  await page.getByRole('button', { name: 'PDF / Yazdır', exact: true }).click()
  const printFrame = page.frameLocator('#flow-map-print')
  await expect(printFrame.locator('section')).toHaveCount(1)
  await expect(printFrame.locator('[data-system-role="middleware"]')).toHaveCount(1)
  await expect(printFrame.locator('body')).toContainText('Akış 12')
  await expect(printFrame.locator('body')).toContainText('Toplam 13 akış')
})

for (const width of [1440, 390]) {
  test(`${width}px: görünüm ekrana sığar ve seçili akış ayrıntıları erişilebilir`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    await page.locator('[data-flow-id="30"] text').filter({ hasText: 'Sipariş aktarımı' }).click()
    await page.screenshot({ path: testInfo.outputPath(`flow-map-${width}.png`), fullPage: true })
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
    await expect(page.getByRole('complementary', { name: 'Seçili akış ayrıntıları' })).toContainText('Sipariş aktarımı')
  })
}

test('liste hatasında eski çizimi ve indirmeyi kapatır; yenilemeyle toparlanır', async ({ page }) => {
  await setup(page)
  await page.route('**/api/v1/integrations', (route) => route.fulfill({ status: 500, json: { message: 'test failure' } }))
  await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('[data-flow-id]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled()
  await page.route('**/api/v1/integrations', (route) => route.fulfill({ json: records }))
  await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(page.locator('[data-flow-id]')).toHaveCount(5)
})

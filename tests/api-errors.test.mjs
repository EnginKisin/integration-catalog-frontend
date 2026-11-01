import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ApiError, clearCsrf, get, post } from '../src/services/api.ts'
import { apiErrorMessages, errorText, errorFieldLabel, readErrorMetadata, mappingDiagnosticText } from '../src/lib/apiErrors.ts'
import { aiErrorText, aiJobErrorText } from '../src/lib/aiMapping.ts'
import { fetchAiJob } from '../src/services/aiMappingBackend.ts'
import { completeAccountAction } from '../src/services/accountBackend.ts'

const catalog = JSON.parse(readFileSync(new URL('./fixtures/error-catalog.json', import.meta.url), 'utf8'))
const originalFetch = globalThis.fetch
const requestId = '8e602015-ea22-4a62-bc33-cda40345b09d'
const json = (body, status = 400, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
beforeEach(clearCsrf)
after(() => { globalThis.fetch = originalFetch })

describe('Türkçe ortak hata sözleşmesi', () => {
  it('katalogdaki tüm hata kodlarının Türkçe karşılığı bulunur', () => {
    for (const entry of catalog.codes) {
      assert.ok(Object.hasOwn(apiErrorMessages, entry.code), entry.code)
      assert.notEqual(errorText(entry.code), entry.message, entry.code)
    }
  })
  it('her HTTP örneğini kodla yerelleştirir ve takip numarasını korur', async () => {
    for (const entry of catalog.codes) for (const example of entry.examples.filter((example) => example.type === 'http')) {
      globalThis.fetch = async () => json(example.body, example.httpStatus, example.headers)
      await assert.rejects(get('/error-contract-probe'), (error) => {
        assert.equal(error.code, entry.code)
        assert.equal(error.message, errorText(entry.code, example.body.params, example.httpStatus))
        assert.equal(error.requestId, requestId)
        assert.equal(error.status, example.httpStatus)
        return true
      })
    }
  })
  it('bilinmeyen kod, ham mesaj ve ayrıntıları Türkçe yedek mesajla karşılar', async () => {
    globalThis.fetch = async () => json({ code: 'FUTURE_CODE', message: 'secret English error', details: ['private SQL'], params: { rejectedValue: 'password' } }, 422)
    await assert.rejects(get('/unknown-code'), (error) => {
      assert.equal(error.message, 'İçerik veya alan seçimlerini kontrol edin.')
      assert.equal(error.code, 'FUTURE_CODE')
      assert.deepEqual(error.details, [])
      assert.deepEqual(error.params, {})
      return true
    })
    assert.equal(errorText('constructor'), 'İşlem tamamlanamadı. Yeniden deneyin.')
    assert.equal(aiJobErrorText('constructor'), apiErrorMessages.AI_INTERNAL_ERROR)
  })
  it('tüm alan ve tamamlama ihlallerini Türkçe ve parametreleriyle korur', async () => {
    globalThis.fetch = async () => json({ code: 'VALIDATION_FAILED', violations: [
      { field: 'email', code: 'INVALID_EMAIL', params: {} },
      { field: '[1].timeoutMs', code: 'MIN_VALUE', params: { min: 1 } },
      { field: null, code: 'REQUIRED_SCHEMA_MISSING', params: { schemaType: 'SOURCE_TO_DEST_REQUEST', environment: 'TEST' } },
    ] })
    await assert.rejects(get('/invalid-fields'), (error) => {
      assert.equal(error.violations.length, 3)
      assert.deepEqual(error.details, ['E-posta: Geçerli bir e-posta adresi girin.', '2. satır · Zaman aşımı (ms): En az 1 değerini girin.', 'Gerekli istek veya yanıt örneği eksik. (Ortam: TEST · Kaynak → hedef isteği)'])
      return true
    })
    assert.equal(errorText('INVALID_LENGTH', { min: 12, max: 128 }), 'Uzunluk 12–128 karakter arasında olmalıdır.')
    assert.equal(errorText('INVALID_LENGTH', { min: 0, max: 100 }), 'En fazla 100 karakter girin.')
    assert.equal(errorFieldLabel('mappings[0].sourceFieldPath'), '1. eşleme · Kaynak alan yolu')
  })
  it('bozuk metadata, ham alan değerleri ve geçersiz takip numarasını göstermez', () => {
    const metadata = readErrorMetadata({ requestId: 'secret-token', params: { max: '<secret>', secret: 'private' }, violations: [null, 'bad', { field: '<secret>', code: 'REQUIRED' }, { field: 'email', code: 'constructor' }, { field: 'email', code: 'INVALID_LENGTH', params: { min: {}, max: 50 } }] }, null)
    assert.equal(metadata.requestId, undefined)
    assert.equal(metadata.violations.length, 1)
    assert.equal(errorText('INVALID_LENGTH', metadata.params), apiErrorMessages.INVALID_LENGTH)
    assert.ok(!errorText('REQUIRED', { environment: 'secret', schemaType: 'secret' }).includes('secret'))
  })
  it('503 hata kodu ve destek numarası AI mesajında kaybolmaz', async () => {
    globalThis.fetch = async () => json({ code: 'AI_DISABLED' }, 503, { 'X-Request-ID': requestId })
    await assert.rejects(get('/ai-disabled'), (error) => {
      assert.equal(error.code, 'AI_DISABLED')
      assert.equal(error.message, apiErrorMessages.AI_DISABLED)
      assert.ok(aiErrorText(error).includes(requestId))
      return true
    })
  })
  it('iş durumu EXPIRED geçerli yanıt olarak alınır; sağlayıcı hatası oturum hatasına dönüşmez', async () => {
    globalThis.fetch = async () => json({ jobId: 'expired-job', status: 'EXPIRED', errorCode: 'AI_RESULT_EXPIRED', pollAfterMs: null }, 200)
    assert.equal((await fetchAiJob('30', 'expired-job')).status, 'EXPIRED')
    assert.equal(aiJobErrorText('AI_CONTENT_BLOCKED'), apiErrorMessages.AI_CONTENT_BLOCKED)
    assert.ok(mappingDiagnosticText('TYPE_MISMATCH').includes('Alan türleri'))
    assert.ok(aiJobErrorText('AI_AUTHENTICATION_FAILED').includes('AI servisinin'))
  })
  it('hesap bağlantısı hatasında kod, ihlal ve takip numarası korunur', async () => {
    globalThis.fetch = async (url) => url.endsWith('/csrf') ? json({ headerName: 'X-CSRF-TOKEN', token: 'test-csrf' }, 200) : json({ code: 'ACCOUNT_LINK_INVALID', requestId, violations: [{ field: 'token', code: 'ACCOUNT_LINK_INVALID', params: {} }] })
    await assert.rejects(completeAccountAction({ purpose: 'EMAIL_CHANGE', token: 'secret-token' }, '', ''), (error) => error instanceof ApiError && error.code === 'ACCOUNT_LINK_INVALID' && error.requestId === requestId && error.violations.length === 1 && !JSON.stringify(error).includes('secret-token'))
  })
  it('kodlu yetki reddinde CSRF yenilemez ve yazmayı otomatik tekrarlamaz', async () => {
    const calls = []
    globalThis.fetch = async (url) => { calls.push(url); return url.endsWith('/csrf') ? json({ headerName: 'X-CSRF-TOKEN', token: 'test-csrf' }, 200) : json({ code: 'ACCESS_DENIED' }, 403) }
    await assert.rejects(post('/denied-write'), (error) => error.code === 'ACCESS_DENIED')
    assert.deepEqual(calls, ['/api/v1/auth/csrf', '/api/v1/denied-write'])
  })
})

export type ErrorParams = Record<string, string | number | boolean>
export interface ApiViolation { field: string | null; code: string; params: ErrorParams }
export interface ErrorMetadata { requestId?: string; violations?: ApiViolation[]; params?: ErrorParams }

// Keep user-facing copy independent of backend fallback text and HTTP wording.
export const apiErrorMessages: Record<string, string> = {
  SESSION_INVALID: 'Oturumunuz artık geçerli değil. Yeniden giriş yapın.',
  AUTH_REQUIRED: 'Bu işlem için giriş yapmanız gerekiyor.',
  INVALID_CREDENTIALS: 'Kullanıcı adı veya parola hatalı.',
  ACCESS_DENIED: 'Bu işlem için yetkiniz bulunmuyor.',
  CSRF_MISSING: 'Oturum güvenlik bilgisi eksik. İşlemi yeniden başlatın.',
  CSRF_INVALID: 'Oturum güvenlik bilgisi değişmiş. İşlemi yeniden başlatın.',
  ACCOUNT_VERIFICATION_UNAVAILABLE: 'Hesabınıza erişim şu anda doğrulanamıyor. Bir süre sonra tekrar deneyin.',
  RATE_LIMITED: 'Çok fazla istek gönderildi. Bir süre bekleyip tekrar deneyin.',
  VALIDATION_FAILED: 'Gönderilen bilgilerde hatalar var. İşaretlenen alanları kontrol edin.',
  INVALID_REQUEST_BODY: 'Gönderilen bilgiler okunamadı. Bilgileri kontrol edip yeniden deneyin.',
  INVALID_PARAMETER: 'İstek bilgilerinden biri geçersiz. Seçimlerinizi kontrol edin.',
  MISSING_REQUEST_HEADER: 'İstek için gerekli bilgiler eksik. İşlemi yeniden başlatın.',
  MISSING_REQUEST_PARAMETER: 'İstek için gerekli bir bilgi eksik. Seçimlerinizi kontrol edin.',
  MISSING_UPLOAD_PART: 'Dosya veya dosyaya ait bilgiler eksik. Dosyayı yeniden seçin.',
  METHOD_NOT_ALLOWED: 'Bu işlem desteklenmiyor. Sayfayı yenileyip tekrar deneyin.',
  UNSUPPORTED_MEDIA_TYPE: 'Gönderilen içerik türü desteklenmiyor.',
  NOT_ACCEPTABLE: 'İstenen yanıt biçimi desteklenmiyor.',
  RESOURCE_NOT_FOUND: 'Kayıt bulunamadı. Listeyi yenileyin.',
  INTEGRATION_NOT_FOUND: 'Entegrasyon bulunamadı. Listeyi yenileyin.',
  SYSTEM_NOT_FOUND: 'Sistem bulunamadı. Sistem listesini yenileyin.',
  SCHEMA_NOT_FOUND: 'İlgili veri yapısı bu entegrasyonda bulunamadı. Kaydı yenileyin.',
  AI_JOB_NOT_FOUND: 'AI öneri işlemi bulunamadı. Yeni bir işlem başlatın.',
  SAMPLE_FILE_NOT_FOUND: 'Örnek dosya bulunamadı. Kaydı yenileyin.',
  ACCOUNT_NOT_FOUND: 'Hesap bulunamadı. Oturumunuzu veya kullanıcı listesini yenileyin.',
  CONFIG_NOT_FOUND: 'Ortam bağlantısı bulunamadı. Kaydı yenileyin.',
  CONCURRENT_MODIFICATION: 'Kayıt başka bir işlemde değişti. Güncel kaydı yeniden okuyun.',
  DATA_CONFLICT: 'Gönderilen bilgiler mevcut bir kayıtla çakışıyor. Bilgileri kontrol edin.',
  INTERNAL_ERROR: 'Sunucu işlemi tamamlayamadı. Tekrar kaydetmeden önce güncel kaydı kontrol edin.',
  SERVICE_UNAVAILABLE: 'Servis geçici olarak kullanılamıyor. Tekrar kaydetmeden önce güncel kaydı kontrol edin.',
  BAD_REQUEST: 'İstek işlenemedi. Gönderilen bilgileri kontrol edin.',
  CONFLICT: 'İşlem mevcut kayıt durumuyla uyumlu değil. Güncel kaydı kontrol edin.',
  USERNAME_TAKEN: 'Bu kullanıcı adı zaten kullanılıyor. Başka bir kullanıcı adı seçin.',
  INVITATION_NOT_PENDING: 'Bu hesap davet kabulü beklemiyor. Kullanıcı listesini yenileyin.',
  INVITATION_RATE_LIMITED: 'Yeni davet göndermeden önce belirtilen süreyi bekleyin.',
  ACCOUNT_EMAIL_REQUIRED: 'Bu işlem için hesaba bağlı doğrulanmış bir e-posta adresi gerekiyor.',
  LAST_ADMIN_RESET_RESTRICTED: 'Son aktif yönetici parolasını giriş ekranındaki parola kurtarma işlemiyle sıfırlamalıdır.',
  PASSWORD_RESET_RATE_LIMITED: 'Yeni parola sıfırlama isteğinden önce belirtilen süreyi bekleyin.',
  EMAIL_UNAVAILABLE: 'Bu e-posta adresi kullanılamıyor. Başka bir adres girin.',
  EMAIL_CHANGE_RATE_LIMITED: 'Yeni e-posta değişikliği isteğinden önce belirtilen süreyi bekleyin.',
  LAST_ADMIN_REQUIRED: 'Son aktif yöneticinin erişimi kaldırılamaz. Önce başka bir aktif yönetici tanımlayın.',
  EMAIL_VERIFICATION_REQUIRED: 'Hesap aktifleştirilmeden önce e-posta adresi doğrulanmalıdır.',
  ACCOUNT_UNAVAILABLE: 'Hesap bu işlem için kullanılamıyor. Oturumunuzu kontrol edin.',
  CURRENT_PASSWORD_INVALID: 'Mevcut parola hatalı.',
  PASSWORD_REUSE: 'Yeni parola önceki paroladan farklı olmalıdır.',
  ACCOUNT_LINK_INVALID: 'Hesap bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Yeni bağlantı isteyin.',
  CREDENTIAL_PERMISSION_REQUIRED: 'Bağlantı bilgilerine erişmek için ek yetki gerekiyor.',
  SYSTEM_IN_USE: 'Sistem entegrasyonlarda kullanılıyor. Silmek yerine pasifleştirebilirsiniz.',
  INACTIVE_SYSTEM_SELECTION: 'Yeni bağlantı için pasif sistem seçilemez. Aktif bir sistem seçin.',
  DUPLICATE_ENVIRONMENT_CONFIG: 'Aynı ortam ve hedef için birden fazla bağlantı tanımlanamaz.',
  CREDENTIALS_EMPTY: 'Erişim bilgileri boş olamaz.',
  CREDENTIALS_REQUIRED: 'Seçilen kimlik doğrulama yöntemi için erişim bilgileri gerekiyor.',
  INTEGRATION_INCOMPLETE: 'Entegrasyon henüz tamamlanmaya hazır değil. Aşağıdaki eksikleri giderin.',
  REVIEW_REQUIRED: 'Korunan ayarları gözden geçirip incelemeyi onaylayın.',
  BASIC_INFORMATION_REQUIRED: 'Entegrasyonun temel bilgilerini tamamlayın.',
  INVALID_MIDDLEWARE_SELECTION: 'Ara katman seçimi akışla uyumlu değil. Sistem seçimlerini kontrol edin.',
  DUPLICATE_SCHEMA_TYPE: 'Aynı yönde birden fazla veri yapısı bulunuyor.',
  REQUIRED_SCHEMA_MISSING: 'Gerekli istek veya yanıt örneği eksik.',
  INVALID_MAPPING_CONNECTION: 'Alan eşlemesinin veri yapısı bağlantısını ve alan yollarını kontrol edin.',
  ENVIRONMENT_CONFIG_REQUIRED: 'En az bir ortam bağlantısı tanımlayın.',
  INVALID_ENVIRONMENT_CONFIG: 'Ortam bağlantısının ayarlarını kontrol edin.',
  MIDDLEWARE_CONFIG_NOT_ALLOWED: 'Bu akışta ara katman bağlantısı kullanılamaz. Eski bağlantıyı kaldırın.',
  DESTINATION_CONFIG_REQUIRED: 'Bu ortam için hedef sistem bağlantısını tanımlayın.',
  MIDDLEWARE_CONFIG_REQUIRED: 'Bu ortam için ara katman bağlantısını tanımlayın.',
  REQUIRED: 'Bu alan zorunludur.',
  INVALID_EMAIL: 'Geçerli bir e-posta adresi girin.',
  INVALID_LENGTH: 'Karakter sayısı izin verilen aralığın dışında.',
  INVALID_FORMAT: 'Bilginin biçimini kontrol edin.',
  INVALID_VALUE: 'Geçerli bir değer girin.',
  MIN_VALUE: 'Değer izin verilen alt sınırın altında.',
  MAX_VALUE: 'Değer izin verilen üst sınırı aşıyor.',
  POSITIVE_REQUIRED: 'Sıfırdan büyük bir değer girin.',
  NON_NEGATIVE_REQUIRED: 'Sıfır veya daha büyük bir değer girin.',
  INVALID_SCHEMA_TYPE: 'Veri yapısının yönü entegrasyon akışıyla uyumlu değil.',
  FORMAT_MISMATCH: 'İçerik formatı seçilen kaynak veya hedef formatıyla eşleşmiyor.',
  FORMAT_REQUIRED: 'İçerik formatını seçin.',
  INVALID_CONTENT: 'İçerik seçilen format veya akışla uyumlu değil.',
  INVALID_FILE: 'Dosya okunamadı. Dosyayı kontrol edip yeniden seçin.',
  INVALID_JSON: 'Geçerli bir JSON nesnesi girin. Dizi veya tek değer kabul edilmez.',
  FILE_REQUIRED: 'Bir örnek dosya yükleyin.',
  MAPPING_NOT_SUPPORTED: 'Seçilen formatta alan eşlemesi desteklenmiyor.',
  SAMPLE_REQUIRED: 'Kaynak ve hedef için gerekli bağımsız tanım veya örnekleri kaydedin.',
  INVALID_SCHEMA: 'Kayıtlı veri yapısı içeriğiyle uyumlu değil. Örneği kontrol edin.',
  EMPTY_SCHEMA: 'Veri yapısı tanımı boş olamaz.',
  FIELD_PATH_NOT_FOUND: 'Alan yolu seçilen örnekte bulunamadı. Alan yolunu kontrol edin.',
  INVALID_ENCODING: 'Metin dosyasını UTF-8 olarak kaydedip yeniden seçin.',
  INVALID_XML: 'XML içeriği geçersiz veya desteklenmiyor. İçeriği kontrol edin.',
  XML_COMPLEXITY_LIMIT: 'XML derinliği, alan sayısı veya alan yolu uzunluğu sınırı aşıyor. Örneği küçültün.',
  INVALID_IDOC: 'IDOC örneği, IDOC elemanı içeren geçerli XML olmalıdır.',
  INVALID_CSV_OPTIONS: 'CSV ayırıcı ve başlık seçeneklerini kontrol edin.',
  INVALID_CSV: 'CSV içeriğini, başlıkları ve sütun sayılarını kontrol edin.',
  INVALID_EXCEL: 'Uzantısıyla uyumlu, okunabilir ve şifresiz bir Excel dosyası seçin.',
  EMPTY_CONTENT: 'İçerik boş olamaz.',
  PAYLOAD_TOO_LARGE: 'Dosya veya içerik boyut sınırını aşıyor. Daha küçük bir örnek seçin.',
  INVALID_FILE_NAME: 'Dosya adı geçersiz. Dosyayı yeniden adlandırıp seçin.',
  UNSUPPORTED_FILE_EXTENSION: 'Dosya uzantısı seçilen formatla eşleşmiyor.',
  INVALID_JSON_SCHEMA: 'JSON veri yapısındaki alan tanımlarını kontrol edin.',
  INPUT_TOO_COMPLEX: 'İçerik derinliği veya alan yolu uzunluğu desteklenen sınırı aşıyor.',
  TOO_MANY_FIELDS: 'İçerikteki alan sayısı desteklenen sınırı aşıyor.',
  SCHEMA_MAPPING_CONFLICT: 'Yeni örnek mevcut eşlemeleri geçersiz kılıyor. İlgili bağlantıları kaldırıp eşlemeleri kaydettikten sonra yeniden deneyin.',
  INVALID_IDEMPOTENCY_KEY: 'İşlem anahtarı geçersiz. Güncel bilgilerle işlemi yeniden başlatın.',
  INVALID_SCHEMA_PAIR: 'Kaynak ve hedef veri yapıları bu akışta eşleştirilemez.',
  AI_INPUT_TOO_LARGE: 'Örnekler AI sınırını aşıyor. Daha küçük ve temsilî bir örnek kullanın.',
  AI_CONTEXT_LIMIT: 'Alan sayısı veya örnek boyutu AI sınırını aşıyor. Örnekleri küçültün.',
  AI_QUEUE_FULL: 'AI işlem sırası dolu. Bir süre sonra tekrar deneyin.',
  CONTEXT_CHANGED: 'Örnekler veya kayıtlı eşlemeler değişti. Güncel bilgilerle yeni öneri oluşturun.',
  MAPPING_CONFLICT: 'Hedef alanlardan biri başka bir bağlantıda kullanılıyor. Seçimlerinizi kontrol edin.',
  INVALID_SUGGESTION: 'Öneri bu işleme ait değil veya artık geçerli değil. Yeni öneri oluşturun.',
  AI_DISABLED: 'AI önerileri bu ortamda etkin değil. Manuel eşlemeye devam edebilirsiniz.',
  AI_PROVIDER_NOT_SUPPORTED: 'Yapılandırılan AI sağlayıcısı kullanılamıyor. Manuel eşlemeye devam edebilirsiniz.',
  AI_FORMAT_NOT_SUPPORTED: 'AI önerileri yalnızca JSON, XML ve IDOC alanları için kullanılabilir.',
  AI_RESULT_EXPIRED: 'Önerilerin süresi doldu. Yeni bir öneri işlemi başlatın.',
  AI_RESULT_NOT_READY: 'AI sonucu henüz hazır değil. İşlemin durumunu yeniden sorgulayın.',
  IDEMPOTENCY_CONFLICT: 'Bu işlem anahtarı farklı bir istek için kullanılmış. Güncel bilgilerle yeni öneri oluşturun.',
  AI_API_KEY_MISSING: 'AI servisinin erişim anahtarı tanımlanmamış. Manuel eşlemeye devam edebilirsiniz.',
  AI_CONFIGURATION_INVALID: 'AI servisi henüz kullanıma hazır değil. Manuel eşlemeye devam edebilirsiniz.',
  AI_AUTHENTICATION_FAILED: 'AI servisinin erişim bilgileri veya yetkileri geçersiz. Manuel eşlemeye devam edebilirsiniz.',
  AI_MODEL_NOT_AVAILABLE: 'Yapılandırılan AI modeli kullanılamıyor. Manuel eşlemeye devam edebilirsiniz.',
  AI_RATE_LIMITED: 'AI servisinin kullanım veya istek sınırına ulaşıldı. Daha sonra yeniden deneyebilirsiniz.',
  AI_TIMEOUT: 'AI öneri işlemi zaman aşımına uğradı. Daha küçük bir örnekle yeniden deneyebilirsiniz.',
  AI_UNAVAILABLE: 'AI servisine şu anda ulaşılamıyor. Manuel eşlemeye devam edebilirsiniz.',
  AI_INVALID_OUTPUT: 'AI geçerli bir öneri üretemedi. Örneklerinizi kontrol edip yeniden deneyebilirsiniz.',
  AI_OUTPUT_TRUNCATED: 'AI yanıtı tamamlanamadı. Daha küçük bir örnekle yeniden deneyebilirsiniz.',
  AI_INTERRUPTED: 'Öneri işlemi kesintiye uğradı. İsterseniz yeni bir işlem başlatabilirsiniz.',
  AI_CONFIGURATION_CHANGED: 'AI yapılandırması değişti. Yeni bir öneri işlemi başlatın.',
  AI_INTERNAL_ERROR: 'AI işlemi tamamlanamadı. Manuel eşlemeye devam edebilirsiniz.',
  AI_MODEL_NOT_INSTALLED: 'AI modeli henüz hazır değil. Manuel eşlemeye devam edebilir, daha sonra tekrar deneyebilirsiniz.',
  AI_CLOUD_MODEL_FORBIDDEN: 'AI servisi uygun bir yerel modelle yapılandırılmamış. Manuel eşlemeye devam edebilirsiniz.',
  AI_CONTENT_BLOCKED: 'AI servisi içeriği işleyemedi. Örneğinizi gözden geçirin veya manuel eşlemeye devam edin.',
}

const schemaNames: Record<string, string> = {
  SOURCE_TO_MW_REQUEST: 'Kaynak → ara katman isteği', MW_TO_DEST_REQUEST: 'Ara katman → hedef isteği',
  DEST_TO_MW_RESPONSE: 'Hedef → ara katman yanıtı', MW_TO_SOURCE_RESPONSE: 'Ara katman → kaynak yanıtı',
  SOURCE_TO_DEST_REQUEST: 'Kaynak → hedef isteği', DEST_TO_SOURCE_RESPONSE: 'Hedef → kaynak yanıtı',
}
const fields: Record<string, string> = {
  name: 'İsim', description: 'Açıklama', username: 'Kullanıcı adı', password: 'Parola', email: 'E-posta',
  currentPassword: 'Mevcut parola', newPassword: 'Yeni parola', token: 'Hesap bağlantısı', role: 'Rol', permissions: 'Erişim izinleri', active: 'Aktiflik',
  sourceSystemId: 'Kaynak sistem', destinationSystemId: 'Hedef sistem', middlewareSystemId: 'Ara katman', hasMiddleware: 'Ara katman seçimi', isSync: 'Akış türü',
  sourcePayloadFormat: 'Kaynak formatı', destinationPayloadFormat: 'Hedef formatı', configTarget: 'Bağlantı hedefi', environmentType: 'Ortam',
  url: 'Bağlantı adresi', timeoutMs: 'Zaman aşımı (ms)', retryCount: 'Yeniden deneme sayısı', retryIntervalMs: 'Deneme aralığı (ms)', authType: 'Kimlik doğrulama', authCredentials: 'Erişim bilgileri',
  schemaType: 'Veri yapısı yönü', format: 'İçerik formatı', rawContent: 'Örnek içerik', schemaDefinition: 'Veri yapısı', samplePayload: 'Örnek veri',
  targetFormat: 'Hedef formatı', targetSchemaDefinition: 'Hedef veri yapısı', targetSamplePayload: 'Hedef örneği', targetRawContent: 'Hedef içerik',
  sourceSchemaId: 'Kaynak veri yapısı', targetSchemaId: 'Hedef veri yapısı', sourceFieldPath: 'Kaynak alan yolu', targetFieldPath: 'Hedef alan yolu',
  file: 'Dosya', metadata: 'Dosya bilgileri', csvOptions: 'CSV seçenekleri', delimiter: 'CSV ayırıcı', hasHeader: 'Başlık satırı', expectedContextRevision: 'Örnek sürümü',
  page: 'Sayfa', size: 'Sayfa boyutu', id: 'Kayıt', confirmed: 'İnceleme onayı', useSampleValues: 'Örnek değer kullanımı',
}
const own = (object: Record<string, string>, key: string) => Object.hasOwn(object, key) ? object[key] : undefined
const numberParam = (params: ErrorParams, key: string) => typeof params[key] === 'number' && Number.isFinite(params[key]) ? params[key] as number : undefined

export function errorText(code?: string, params: ErrorParams = {}, status = 0): string {
  let message = code ? own(apiErrorMessages, code) : undefined
  const min = numberParam(params, 'min'), max = numberParam(params, 'max')
  if (code === 'INVALID_LENGTH') {
    if (min !== undefined && max !== undefined && min > 0) message = `Uzunluk ${min}–${max} karakter arasında olmalıdır.`
    else if (max !== undefined) message = `En fazla ${max} karakter girin.`
    else if (min !== undefined) message = `En az ${min} karakter girin.`
  }
  if (code === 'MIN_VALUE' && min !== undefined) message = `En az ${min} değerini girin.`
  if (code === 'MAX_VALUE' && max !== undefined) message = `En fazla ${max} değerini girin.`
  if (!message) message = status >= 500 ? apiErrorMessages.INTERNAL_ERROR : ({ 400: 'Gönderilen bilgileri kontrol edin.', 401: 'Giriş gerekli veya giriş bilgileri hatalı.', 403: 'İşlem reddedildi. Yetkinizi ve oturumunuzu kontrol edin.', 404: 'Kayıt bulunamadı. Listeyi yenileyin.', 409: apiErrorMessages.CONFLICT, 410: 'Bu kaydın veya işlemin süresi dolmuş. Güncel bilgilerle yeniden başlayın.', 413: apiErrorMessages.PAYLOAD_TOO_LARGE, 422: 'İçerik veya alan seçimlerini kontrol edin.', 429: apiErrorMessages.RATE_LIMITED } as Record<number, string>)[status] ?? 'İşlem tamamlanamadı. Yeniden deneyin.'
  const context: string[] = []
  if (typeof params.environment === 'string' && ['DEV', 'TEST', 'PROD'].includes(params.environment)) context.push(`Ortam: ${params.environment}`)
  if (typeof params.schemaType === 'string' && own(schemaNames, params.schemaType)) context.push(own(schemaNames, params.schemaType)!)
  const maxBytes = numberParam(params, 'maxBytes'), maxFields = numberParam(params, 'maxFields'), usageCount = numberParam(params, 'usageCount')
  if (maxBytes !== undefined && maxBytes > 0) context.push(`Boyut sınırı: ${(maxBytes / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} MiB`)
  if (maxFields !== undefined) context.push(`Alan sınırı: ${maxFields}`)
  if (code === 'SYSTEM_IN_USE' && usageCount !== undefined) context.push(`${usageCount} entegrasyonda kullanılıyor`)
  return context.length ? `${message} (${context.join(' · ')})` : message
}

export function errorFieldLabel(field: string): string {
  const leaf = field.split('.').at(-1) ?? field
  const label = own(fields, leaf) ?? 'Alan'
  const index = field.match(/\[(\d{1,5})\]/)?.[1]
  return index === undefined ? label : `${Number(index) + 1}. ${field.startsWith('mappings[') ? 'eşleme' : 'satır'} · ${label}`
}

const paramKeys = new Set(['min', 'max', 'maxBytes', 'maxFields', 'usageCount', 'mappingId', 'schemaType', 'environment', 'environmentType', 'configTarget', 'format', 'header', 'parameter', 'part', 'limit', 'count'])
function readParams(value: unknown): ErrorParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => paramKeys.has(key) && (typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean' || typeof item === 'string' && item.length <= 120 && !/[\u0000-\u001f]/.test(item))))
}
export const readErrorCode = (value: unknown): string | undefined => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : undefined
export function readErrorMetadata(body: Record<string, unknown>, headerId: string | null): Required<Pick<ErrorMetadata, 'violations' | 'params'>> & Pick<ErrorMetadata, 'requestId'> {
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  const violations: ApiViolation[] = []
  if (Array.isArray(body.violations)) for (const item of body.violations) {
    if (!item || typeof item !== 'object') continue
    const code = readErrorCode(item.code)
    if (!code || !(item.field === null || typeof item.field === 'string' && /^[\w.\[\]]{1,180}$/.test(item.field))) continue
    violations.push({ field: item.field, code, params: readParams(item.params) })
  }
  return { violations, params: readParams(body.params), requestId: uuid(headerId) ? headerId : uuid(body.requestId) ? body.requestId : undefined }
}

export function violationText(violation: ApiViolation): string {
  const message = errorText(violation.code, violation.params, 400)
  return violation.field ? `${errorFieldLabel(violation.field)}: ${message}` : message
}

export const mappingDiagnosticMessages: Record<string, string> = {
  AMBIGUOUS: 'Birden fazla olası eşleşme var. Hedef alanı manuel seçin.',
  NO_COMPATIBLE_FIELD: 'Uyumlu bir karşı alan bulunamadı.', TYPE_MISMATCH: 'Alan türleri uyumlu değil.',
  INSUFFICIENT_CONTEXT: 'Eşleştirme için yeterli bilgi yok. Örnekleri geliştirin.',
  TRANSFORMATION_REQUIRED: 'Bu alan için veri dönüşümü gerekiyor. Eşlemeyi manuel değerlendirin.',
  NO_CONFIDENT_MATCH: 'Yeterince güvenilir bir eşleşme bulunamadı.',
}
export const mappingDiagnosticText = (code: string) => own(mappingDiagnosticMessages, code) ?? 'Bu alan için uygun bir öneri oluşturulamadı. Alanı manuel değerlendirin.'

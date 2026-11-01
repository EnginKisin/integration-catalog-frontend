import type { Permission, Role, UserAccount } from '../types/account'

export const roles: Role[] = ['VIEWER', 'EDITOR', 'ADMIN']
export const roleLabels: Record<Role, string> = { VIEWER: 'Görüntüleyici', EDITOR: 'Editör', ADMIN: 'Yönetici' }
export const roleDescriptions: Record<Role, string> = {
  VIEWER: 'Entegrasyonları ve sistem tanımlarını görüntüler; kayıt oluşturamaz, düzenleyemez veya silemez.',
  EDITOR: 'Entegrasyonları oluşturur, düzenler ve tamamlar; sistem tanımlarını düzenler. Silme ve kullanıcı yönetimi yetkisi yoktur.',
  ADMIN: 'Kullanıcı yönetimi ve silme dahil tüm işlemleri yapar. Bağlantı bilgilerini görüntüleme ve değiştirme yetkilerine otomatik sahiptir.',
}
export const permissions: Permission[] = ['VIEW_CREDENTIALS', 'MANAGE_CREDENTIALS']
export const permissionLabels: Record<Permission, string> = {
  VIEW_CREDENTIALS: 'Erişim bilgilerini görüntüleme',
  MANAGE_CREDENTIALS: 'Erişim bilgilerini değiştirme',
}
export const permissionDescriptions: Record<Permission, string> = {
  VIEW_CREDENTIALS: 'Entegrasyonlarda kayıtlı parola ve API anahtarlarının açık değerlerini görebilir.',
  MANAGE_CREDENTIALS: 'Bu bilgileri ekleyebilir, değiştirebilir veya temizleyebilir. Mevcut değerleri görebilmesi için görüntüleme izni ayrıca gerekir.',
}
export type AccountPurpose = 'INVITATION' | 'PASSWORD_RESET' | 'EMAIL_CHANGE'
export interface AccountLink { purpose: AccountPurpose; token: string; nonce: number }
export interface InvitationInput { username: string; email: string; role: Role }
export const resetRequestMessage = 'Adres uygun bir hesaba aitse parola sıfırlama bağlantısı gönderilecektir. E-posta kutunuzu kontrol edin.'
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 12 || password.length > 128 || !password.trim()) throw new Error('Yeni parola 12–128 karakter olmalı ve yalnızca boşluk içermemelidir.')
  if (password !== confirmation) throw new Error('Yeni parolalar eşleşmiyor.')
}
export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin (en fazla 254 karakter).')
  return email
}
export function invitationInput(input: InvitationInput): InvitationInput {
  const username = input.username.trim()
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(username)) throw new Error('Kullanıcı adı 1–100 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi içerebilir.')
  if (!roles.includes(input.role)) throw new Error('Geçerli bir rol seçin.')
  return { username, email: normalizeEmail(input.email), role: input.role }
}
export function permissionInput(values: Permission[]): Permission[] {
  if (!Array.isArray(values) || values.some((value) => !permissions.includes(value))) throw new Error('Geçersiz erişim bilgisi izni.')
  return [...new Set(values)]
}
export function parseAccountFragment(location: Pick<Location, 'pathname' | 'hash'>, history: Pick<History, 'replaceState'>): Omit<AccountLink, 'nonce'> | null {
  if (location.pathname !== '/account/action') return null
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  history.replaceState(null, '', '/account/action')
  const purpose = params.get('purpose')
  const token = params.get('token')
  if (params.getAll('purpose').length !== 1 || params.getAll('token').length !== 1 || !token?.trim() || token.length > 4096 || !['INVITATION', 'PASSWORD_RESET', 'EMAIL_CHANGE'].includes(purpose ?? '')) return null
  return { purpose: purpose as AccountPurpose, token }
}
export type UserAction = 'role' | 'permissions' | 'active' | 'resend' | 'reset' | 'revoke'
export const userActionLabels: Record<UserAction, string> = {
  role: 'Rolü değiştir', permissions: 'Erişim izinleri', active: 'Aktiflik',
  resend: 'Daveti yeniden gönder', reset: 'Zorunlu parola sıfırlama', revoke: 'Oturumları kapat',
}
export const invalidatesUserSession = (action: UserAction) => action !== 'resend'
export const isCurrentAccount = (account: Pick<UserAccount, 'username'>, username: string) => account.username === username

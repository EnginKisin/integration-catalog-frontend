import { ApiError, clearCsrf, get, post, refreshCsrf, request } from './api.ts'
import type { Permission, Profile } from '../types/account'
import { permissions } from '../lib/account.ts'
let identityBusy = false
export async function authChange<T>(action: () => Promise<T>): Promise<T> {
  if (identityBusy) throw new ApiError('Başka bir hesap işlemi sürüyor. Tamamlanmasını bekleyin.', 409)
  identityBusy = true
  try { return await action() } finally { identityBusy = false }
}
export async function getProfile(): Promise<Profile> {
  const value = await get<Profile>('/auth/me')
  if (!value || typeof value.username !== 'string' || (value.email !== null && typeof value.email !== 'string') || typeof value.emailVerified !== 'boolean' || typeof value.active !== 'boolean' || !Array.isArray(value.authorities) || !value.authorities.every((role) => typeof role === 'string') || !Array.isArray(value.permissions) || value.permissions.some((permission) => !permissions.includes(permission))) throw new ApiError('Oturum bilgisi beklenen biçimde alınamadı. Bağlantıyı yeniden kontrol edin.')
  return { username: value.username, email: value.email, emailVerified: value.emailVerified, active: value.active, authorities: [...value.authorities], permissions: [...value.permissions] }
}
export function login(username: string, password: string) {
  return authChange(async () => {
    clearCsrf()
    await refreshCsrf()
    await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password }) })
    clearCsrf()
    await refreshCsrf()
    return getProfile()
  })
}
export function logout() {
  return authChange(async () => {
    try { await post('/auth/logout') } finally { clearCsrf() }
  })
}
export const isAdmin = (user: Profile) => user.authorities.includes('ROLE_ADMIN')
export const canEdit = (user: Profile) => isAdmin(user) || user.authorities.includes('ROLE_EDITOR')
export const canViewCredentials = (user: Profile) => isAdmin(user) || user.permissions.includes('VIEW_CREDENTIALS')
export const canManageCredentials = (user: Profile) => isAdmin(user) || (canEdit(user) && user.permissions.includes('MANAGE_CREDENTIALS'))
export const hasPermission = (user: Profile, permission: Permission) => isAdmin(user) || user.permissions.includes(permission)

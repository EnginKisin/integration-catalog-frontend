import { ApiError, get, post, put } from './api.ts'
import { invitationInput, permissionInput, permissions, roles } from '../lib/account.ts'
import type { InvitationInput } from '../lib/account'
import type { Permission, Role, UserAccount, UserPage } from '../types/account'
import { authChange } from './auth.ts'

function userAccount(value: UserAccount): UserAccount {
  if (!value || !Number.isSafeInteger(value.id) || value.id <= 0 || typeof value.username !== 'string' || !roles.includes(value.role) || typeof value.active !== 'boolean' || typeof value.emailVerified !== 'boolean' || typeof value.passwordResetRequired !== 'boolean' || (value.email !== null && typeof value.email !== 'string') || !Array.isArray(value.permissions) || value.permissions.some((permission) => !permissions.includes(permission))) throw new ApiError('Sunucudan beklenen kullanıcı yanıtı alınamadı. İşlem yaptıysanız listeyi yenileyin.')
  return { id: value.id, username: value.username, email: value.email, emailVerified: value.emailVerified, active: value.active, passwordResetRequired: value.passwordResetRequired, role: value.role, permissions: permissionInput(value.permissions) }
}
const validId = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Geçersiz kullanıcı IDsi.')
  return id
}
export async function fetchUsers(page = 0, size = 20): Promise<UserPage> {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error('Geçersiz kullanıcı sayfası.')
  const value = await get<UserPage>(`/users?page=${page}&size=${size}`)
  if (!value || !Array.isArray(value.items) || ![value.page, value.size, value.totalElements, value.totalPages].every(Number.isSafeInteger) || value.page < 0 || value.size < 1 || value.size > 100 || value.totalElements < 0 || value.totalPages < 0) throw new ApiError('Kullanıcı listesi beklenen biçimde alınamadı.')
  return { items: value.items.map(userAccount), page: value.page, size: value.size, totalElements: value.totalElements, totalPages: value.totalPages }
}
export function inviteUser(input: InvitationInput) { return authChange(async () => userAccount(await post<UserAccount>('/users', invitationInput(input)))) }
export function setUserRole(id: number, role: Role) {
  return authChange(async () => {
    if (!roles.includes(role)) throw new Error('Geçersiz rol.')
    return userAccount(await put<UserAccount>(`/users/${validId(id)}/role`, { role }))
  })
}
export function setUserActive(id: number, active: boolean) { return authChange(async () => userAccount(await put<UserAccount>(`/users/${validId(id)}/active`, { active }))) }
export function setUserPermissions(id: number, permissions: Permission[]) { return authChange(async () => userAccount(await put<UserAccount>(`/users/${validId(id)}/permissions`, { permissions: permissionInput(permissions) }))) }
export const resendInvitation = (id: number) => authChange(() => post(`/users/${validId(id)}/invitations/resend`))
export const forcePasswordReset = (id: number) => authChange(() => post(`/users/${validId(id)}/password-reset`))
export const revokeUserSessions = (id: number) => authChange(() => post(`/users/${validId(id)}/sessions/revoke`))
export async function fetchMailStatus(): Promise<{ pending: number; failed: number }> {
  const value = await get<{ pending: number; failed: number }>('/users/mail-status')
  if (!value || !Number.isSafeInteger(value.pending) || value.pending < 0 || !Number.isSafeInteger(value.failed) || value.failed < 0) throw new ApiError('Posta kuyruğu durumu okunamadı.')
  return { pending: value.pending, failed: value.failed }
}

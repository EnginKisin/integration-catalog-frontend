import { ApiError, post } from './api.ts'
import { authChange } from './auth.ts'
import { normalizeEmail, validateNewPassword } from '../lib/account.ts'
import type { AccountLink } from '../lib/account'
export async function requestPasswordReset(email: string) {
  await authChange(() => post('/auth/password-reset/request', { email: normalizeEmail(email) }))
}
export function completeAccountAction(link: Pick<AccountLink, 'purpose' | 'token'>, newPassword: string, confirmation: string) {
  return authChange(async () => {
    if (!link.token.trim()) throw new Error('Hesap bağlantısı bulunamadı. E-postadaki bağlantıyı yeniden açın.')
    try {
      switch (link.purpose) {
        case 'INVITATION': validateNewPassword(newPassword, confirmation); return await post('/auth/invitations/accept', { token: link.token, newPassword })
        case 'PASSWORD_RESET': validateNewPassword(newPassword, confirmation); return await post('/auth/password-reset/confirm', { token: link.token, newPassword })
        case 'EMAIL_CHANGE': return await post('/auth/email/confirm', { token: link.token })
        default: throw new Error('Hesap bağlantısının amacı geçersiz.')
      }
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(error.message.replaceAll(link.token, '[gizlendi]'), error.status, error.details.map((detail) => detail.replaceAll(link.token, '[gizlendi]')), error.retryAt, error.code, { requestId: error.requestId, violations: error.violations, params: error.params })
      throw error
    }
  })
}
export function changePassword(currentPassword: string, newPassword: string, confirmation: string) {
  return authChange(async () => {
    validateNewPassword(newPassword, confirmation)
    if (!currentPassword || currentPassword.length > 128) throw new Error('Mevcut parolanızı girin.')
    if (newPassword === currentPassword) throw new Error('Yeni parola mevcut paroladan farklı olmalıdır.')
    await post('/auth/password/change', { currentPassword, newPassword })
  })
}
export function changeEmail(currentPassword: string, email: string) {
  return authChange(async () => {
    if (!currentPassword || currentPassword.length > 128) throw new Error('Mevcut parolanızı girin.')
    await post('/auth/email/change', { currentPassword, email: normalizeEmail(email) })
  })
}

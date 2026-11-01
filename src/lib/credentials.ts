import type { AuthType } from '../types/integration'
import { parseJsonObject } from './integrationWorkflow.ts'

interface CredentialField { key: string; label: string; secret?: boolean; optional?: boolean; placeholder?: string }
export const credentialFields: Record<Exclude<AuthType, 'NONE'>, CredentialField[]> = {
  BASIC_AUTH: [{ key: 'username', label: 'Kullanıcı adı' }, { key: 'password', label: 'Parola', secret: true }],
  API_KEY: [{ key: 'apiKey', label: 'API anahtarı', secret: true }],
  OAUTH2: [
    { key: 'clientId', label: 'İstemci kimliği (Client ID)' },
    { key: 'clientSecret', label: 'İstemci sırrı (Client Secret)', secret: true },
    { key: 'tokenUrl', label: "Token URL'si", placeholder: 'https://…/oauth/token', optional: true },
    { key: 'scope', label: 'Kapsam (Scope)', optional: true },
  ],
}
export function credentialValues(type: Exclude<AuthType, 'NONE'>, text: string): Record<string, string> {
  if (!text.trim()) return {}
  const value = parseJsonObject(text, 'Erişim bilgisi')
  const keys = new Set(credentialFields[type].map((field) => field.key))
  if (Object.entries(value).some(([key, item]) => !keys.has(key) || typeof item !== 'string')) throw new Error('Bu bilgi özel alanlar içeriyor. Değerleri korumak için gelişmiş JSON düzenleyicisini kullanın.')
  return value as Record<string, string>
}
export function credentialText(values: Record<string, string>): string {
  const entries = Object.entries(values).filter(([, value]) => value !== '')
  return entries.length ? JSON.stringify(Object.fromEntries(entries), null, 2) : ''
}

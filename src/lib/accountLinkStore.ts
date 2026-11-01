import { parseAccountFragment } from './account.ts'
import type { AccountLink } from './account'
let link: AccountLink | null = null
let nonce = 0
const listeners = new Set<() => void>()
export const getAccountLink = () => link
export const subscribeAccountLink = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function captureAccountLink(location: Pick<Location, 'pathname' | 'hash'>, history: Pick<History, 'replaceState'>) {
  const value = parseAccountFragment(location, history)
  link = value ? { ...value, nonce: ++nonce } : null
  listeners.forEach((listener) => listener())
}
export function clearAccountLink(expectedNonce?: number) {
  if (expectedNonce !== undefined && link?.nonce !== expectedNonce) return false
  link = null
  listeners.forEach((listener) => listener())
  return true
}

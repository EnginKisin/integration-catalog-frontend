import { createContext, useContext } from 'react'
import type { Profile } from '../types/account'
export interface Session {
  user: Profile | null
  loading: boolean
  error?: Error
  notice: string
  setUser: (user: Profile | null) => void
  requireLogin: (message: string) => void
  reload: () => void
  signOut: () => Promise<void>
}
export const SessionContext = createContext<Session | null>(null)
export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider eksik')
  return value
}

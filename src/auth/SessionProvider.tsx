import { useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ApiError, clearCsrf } from '../services/api'
import { getProfile, logout } from '../services/auth'
import type { Profile } from '../types/account'
import { SessionContext } from './session'
import { asError } from '../hooks/useRequest'

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUserState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const epoch = useRef(0)
  useEffect(() => {
    let active = true
    const generation = ++epoch.current
    const current = () => active && epoch.current === generation
    getProfile().then((profile) => {
      if (current()) { setUserState(profile); setError(undefined) }
    }).catch((failure: unknown) => {
      if (!current()) return
      setUserState(null)
      if (failure instanceof ApiError && failure.status === 401) { clearCsrf(); setError(undefined) }
      else setError(asError(failure))
    }).finally(() => { if (current()) setLoading(false) })
    return () => { active = false }
  }, [version])
  const requireLogin = (message: string) => {
    epoch.current += 1
    clearCsrf(); setUserState(null); setError(undefined); setLoading(false); setNotice(message)
  }
  useEffect(() => {
    const expire = () => {
      epoch.current += 1
      clearCsrf(); setUserState(null); setError(undefined); setLoading(false)
      setNotice('Oturumunuz sona erdi. Devam etmek için yeniden giriş yapın.')
    }
    window.addEventListener('session-expired', expire)
    return () => window.removeEventListener('session-expired', expire)
  }, [])
  const signOut = async () => {
    const generation = ++epoch.current
    setUserState(null); setError(undefined); setNotice('Çıkış yapılıyor…'); setLoading(true)
    try { await logout(); if (epoch.current === generation) setNotice('Çıkış yapıldı.') }
    catch { if (epoch.current === generation) setNotice('Yerel bilgiler temizlendi. Sunucu çıkışı doğrulanamadı; oturumunuzu kontrol edin.') }
    finally { if (epoch.current === generation) { clearCsrf(); setLoading(false) } }
  }
  const setUser = (profile: Profile | null) => {
    epoch.current += 1
    setUserState(profile); setError(undefined); setLoading(false); setNotice('')
    if (!profile) clearCsrf()
  }
  return <SessionContext.Provider value={{ user, loading, error, notice, setUser, requireLogin, reload: () => { epoch.current += 1; setLoading(true); setVersion((value) => value + 1) }, signOut }}>{children}</SessionContext.Provider>
}

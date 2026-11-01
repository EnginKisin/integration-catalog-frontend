import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('İşlem tamamlanamadı.')
}
// A changed loader discards the previous request's result. Writes never run in effects.
export function useResource<T>(loader: () => Promise<T>) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setState((current) => ({ ...current, error: undefined, loading: true }))
      try {
        const data = await loader()
        if (active) setState({ data, loading: false })
      } catch (error) {
        if (active) setState((current) => ({ ...current, error: asError(error), loading: false }))
      }
    })
    return () => { active = false }
  }, [loader, version])
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { ...state, reload }
}

export function useTask() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error>()
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const run = async (action: () => Promise<void>, success = '') => {
    if (lock.current || (error instanceof ApiError && (error.retryAt ?? 0) > Date.now())) return false
    lock.current = true
    setBusy(true)
    setError(undefined)
    setMessage('')
    try {
      await action()
      setMessage(success)
      return true
    } catch (failure) {
      setError(asError(failure))
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, error, message, run }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTask } from '../../hooks/useRequest'
import { fetchCredentials } from '../../services/integrationsBackend'
import type { EnvironmentConfig } from '../../types/integration'
import { ErrorPanel } from '../ui/feedback'

export function CredentialReveal({ id, config }: { id: string; config: EnvironmentConfig }) {
  const [secret, setSecret] = useState<Record<string, unknown>>()
  const generation = useRef(0)
  const task = useTask()
  const hide = useCallback(() => { generation.current += 1; setSecret(undefined) }, [])
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== 'visible') hide() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { generation.current += 1; document.removeEventListener('visibilitychange', onVisibility) }
  }, [hide])
  useEffect(() => {
    if (!secret) return
    const timer = window.setTimeout(hide, 30000)
    return () => window.clearTimeout(timer)
  }, [secret, hide])
  return <div className="space-y-2">
    <button type="button" className="btn" disabled={task.busy} onClick={() => {
      if (secret) { hide(); return }
      const current = ++generation.current
      void task.run(async () => {
        const response = await fetchCredentials(id, config)
        if (generation.current === current && document.visibilityState === 'visible') setSecret(response.authCredentials)
      })
    }}>{task.busy ? 'Alınıyor…' : secret ? 'Erişim bilgisini gizle' : 'Kayıtlı erişim bilgisini göster'}</button>
    <ErrorPanel error={task.error} />
    {secret && <><pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-amber-400/30 bg-slate-950 p-3 text-xs text-amber-100">{JSON.stringify(secret, null, 2)}</pre><p className="hint">30 saniye sonra veya sekme gizlendiğinde değerler temizlenir.</p></>}
  </div>
}

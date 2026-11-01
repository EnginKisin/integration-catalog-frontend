import { useEffect, useState } from 'react'
import { ApiError } from '../../services/api'
import { payloadErrorHints } from '../../lib/payload'
export function ErrorPanel({ error }: { error?: Error }) {
  const [now, setNow] = useState(Date.now)
  const retryAt = error instanceof ApiError ? error.retryAt : undefined
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  if (!error) return null
  const details = error instanceof ApiError ? error.details : []
  const hint = error instanceof ApiError && error.code ? payloadErrorHints[error.code] : undefined
  const wait = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0
  return <div role="alert" className="error-panel">
    <p>{error.message}</p>
    {hint && <p className="mt-2">{hint}</p>}
    {details.length > 0 && <ul className="mt-2 list-disc pl-5">{details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
    {wait > 0 && <p className="mt-2">{wait} saniye sonra yeniden deneyebilirsiniz.</p>}
    {error instanceof ApiError && error.requestId && <p className="mt-3 break-all text-xs opacity-75">Destek için istek numarası: <code>{error.requestId}</code></p>}
  </div>
}
export function TaskFeedback({ task }: { task: { error?: Error; message: string } }) {
  return <><ErrorPanel error={task.error} />{task.message && <p role="status" className="success-panel">{task.message}</p>}</>
}
export function Loading() { return <div role="status" className="loading-state"><span aria-hidden="true" /><span>Yükleniyor…</span></div> }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="panel border-dashed text-slate-400">{children}</div> }

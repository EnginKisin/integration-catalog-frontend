import type { PropsWithChildren } from 'react'

export function Card({ children }: PropsWithChildren) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-panel">
      {children}
    </div>
  )
}

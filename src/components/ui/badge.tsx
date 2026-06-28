import type { PropsWithChildren } from 'react'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-white/10 text-white',
  success: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20',
  danger: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/20',
  muted: 'bg-white/5 text-slate-400',
}

export function Badge({ variant = 'default', children }: PropsWithChildren<BadgeProps>) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${variantClasses[variant]}`}>
      {children}
    </span>
  )
}

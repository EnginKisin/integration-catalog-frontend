import type { ReactNode } from 'react'
import { AppIcon, type IconName } from './AppIcon'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-heading"><div className="page-heading-copy"><p className="page-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{actions && <div className="page-heading-actions">{actions}</div>}</header>
}

export function SectionHeader({ icon, title, description, actions }: { icon: IconName; title: string; description?: string; actions?: ReactNode }) {
  return <header className="section-heading"><span className="section-heading-icon"><AppIcon name={icon} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="section-heading-actions">{actions}</div>}</header>
}

export function MetricCard({ label, value, icon, tone = 'violet', detail }: { label: string; value: number; icon: IconName; tone?: 'violet' | 'green' | 'blue' | 'amber'; detail?: string }) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-card-top"><span>{label}</span><span className="metric-icon"><AppIcon name={icon} /></span></div><div className="metric-card-value"><strong>{value}</strong>{detail && <span>{detail}</span>}</div></div>
}

export function EmptyState({ title, description, icon = 'catalog', children }: { title: string; description: string; icon?: IconName; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon"><AppIcon name={icon} /></span><h3>{title}</h3><p>{description}</p>{children}</div>
}

export function Brand() {
  return <div className="app-brand"><span className="app-brand-mark"><AppIcon name="layers" /></span><div><strong>Akış<span>workspace</span></strong><p>Entegrasyon Kataloğu</p></div></div>
}

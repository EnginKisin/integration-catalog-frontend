import type { IntegrationRecord } from '../../types/integration'
import { Badge } from '../ui/badge'

interface IntegrationTableProps {
  data: IntegrationRecord[]
}

const statusVariant = {
  active: 'success',
  pending: 'warning',
  paused: 'danger',
} as const

export function IntegrationTable({ data }: IntegrationTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-panel">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-300">
        <thead className="bg-surface2 text-slate-400">
          <tr>
            <th className="px-6 py-4 font-semibold">Integration</th>
            <th className="px-6 py-4 font-semibold">Source</th>
            <th className="px-6 py-4 font-semibold">Destination</th>
            <th className="px-6 py-4 font-semibold">Middleware</th>
            <th className="px-6 py-4 font-semibold">Flow</th>
            <th className="px-6 py-4 font-semibold">Payload</th>
            <th className="px-6 py-4 font-semibold">Status</th>
            <th className="px-6 py-4 font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {data.map((integration, index) => (
            <tr key={integration.id} className={index % 2 === 0 ? 'bg-white/3' : 'bg-transparent'}>
              <td className="px-6 py-4 text-white">
                <div className="text-sm font-semibold">{integration.serviceName}</div>
                <div className="text-xs text-slate-500">{integration.id}</div>
              </td>
              <td className="px-6 py-4">{integration.sourceSystem}</td>
              <td className="px-6 py-4">{integration.destinationSystem}</td>
              <td className="px-6 py-4">{integration.middleware || '—'}</td>
              <td className="px-6 py-4">
                <Badge variant={integration.syncType === 'sync' ? 'default' : 'muted'}>
                  {integration.syncType.toUpperCase()}
                </Badge>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="muted">{integration.formatSource.toUpperCase()}</Badge>
                  <Badge variant="muted">{integration.formatDestination.toUpperCase()}</Badge>
                </div>
              </td>
              <td className="px-6 py-4">
                <Badge variant={statusVariant[integration.status]}>{integration.status}</Badge>
              </td>
              <td className="px-6 py-4 text-slate-500">{integration.lastUpdated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

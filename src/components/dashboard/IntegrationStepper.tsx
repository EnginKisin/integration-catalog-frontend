import type { IntegrationStep, IntegrationStepId } from '../../lib/integrationWorkflow'

export function IntegrationStepper({ steps, current, busy, dirty = false, completed = false, onSelect }: {
  steps: IntegrationStep[]; current: IntegrationStepId; busy: boolean; dirty?: boolean; completed?: boolean; onSelect?: (id: IntegrationStepId) => void
}) {
  const index = steps.findIndex((step) => step.id === current)
  const done = steps.filter((step) => step.issues.length === 0 && (step.id !== 'review' || completed)).length
  const canComplete = steps.every((step) => step.issues.length === 0)
  return <nav aria-label="Entegrasyon adımları" className="workflow-stepper panel space-y-2">
    <div className="flex flex-wrap justify-between gap-2 text-xs"><p className="text-slate-300">Adım {index + 1}/{steps.length} · <span className="font-semibold text-white">{steps[index]?.label}</span></p><p className="text-slate-400">{done}/{steps.length} adım tamamlandı</p></div>
    <div className="h-1 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-label="Kaydedilen adımlar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${done / steps.length * 100}%` }} /></div>
    <ol className="grid grid-cols-2 gap-1.5 lg:flex">{steps.map((step, position) => {
      const active = current === step.id
      const unsaved = active && dirty
      const ready = step.issues.length === 0 && (step.id !== 'review' || completed)
      return <li key={step.id} className="min-w-0 flex-1"><button type="button" title={step.detail} aria-current={active ? 'step' : undefined} disabled={busy || !onSelect} onClick={() => onSelect?.(step.id)} className={`flex h-full w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-violet-400 disabled:cursor-default ${active ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/5 hover:bg-white/5'}`}>
        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${ready && !unsaved ? 'bg-emerald-400/15 text-emerald-300' : active ? 'bg-violet-400/20 text-violet-200' : 'bg-white/5 text-slate-400'}`}>{ready && !unsaved ? '✓' : position + 1}</span>
        <span className="min-w-0"><span className={`block text-xs font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{step.label}</span><span className={`block text-[11px] ${unsaved || (onSelect && step.issues.length) ? 'text-amber-200' : 'text-slate-400'}`}>{!onSelect && !active ? 'Sırada' : unsaved ? 'Kaydedilmedi' : ready ? 'Kaydedildi' : step.issues.length ? `${step.issues.length} eksik / kontrol` : canComplete ? 'Tamamlamaya hazır' : 'Önceki adımlar bekleniyor'}</span><span className="sr-only">{step.detail}</span></span>
      </button></li>
    })}</ol>
  </nav>
}

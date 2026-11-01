import { useEffect, useId, useRef, useState } from 'react'

interface RowAction {
  id: string
  label: string
  onSelect: () => void
  disabled?: boolean
  disabledReason?: string
  danger?: boolean
  separatorBefore?: boolean
}

export function RowActions({ label, disabled = false, items }: { label: string; disabled?: boolean; items: RowAction[] }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const menuItems = () => Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
  const close = () => {
    popoverRef.current?.hidePopover()
    triggerRef.current?.focus()
  }
  const show = (last = false) => {
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover || disabled) return
    popover.showPopover({ source: trigger })
    const anchor = trigger.getBoundingClientRect()
    const { width, height } = popover.getBoundingClientRect()
    popover.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`
    popover.style.top = `${anchor.bottom + height + 6 <= window.innerHeight - 8 ? anchor.bottom + 6 : Math.max(8, anchor.top - height - 6)}px`
    const buttons = menuItems()
    buttons[last ? buttons.length - 1 : 0]?.focus()
  }
  useEffect(() => {
    if (!open) return
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return
      popoverRef.current?.hidePopover()
    }
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])

  return <>
    <button ref={triggerRef} type="button" className="btn w-9 border-transparent bg-transparent p-0 text-slate-400 hover:text-white" disabled={disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} popoverTarget={menuId} title="İşlemler" onClick={(event) => {
      event.preventDefault()
      if (popoverRef.current?.matches(':popover-open')) close()
      else show()
    }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        show(event.key === 'ArrowUp')
      }
    }}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
    </button>
    <div ref={popoverRef} popover="auto" id={menuId} className="row-action-popover fixed inset-auto z-50 m-0 max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border p-1.5 text-slate-100 shadow-xl shadow-black/40" onToggle={(event) => setOpen(event.newState === 'open')} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key === 'Tab') { close(); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const buttons = menuItems()
      const current = buttons.findIndex((button) => button === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }}>
      <div role="menu" aria-label={label}>{items.map((item) => <div key={item.id} role="none">
        {item.separatorBefore && <div role="separator" className="my-1 border-t border-white/10" />}
        <button type="button" role="menuitem" tabIndex={-1} disabled={disabled || item.disabled} className={`min-h-9 w-full rounded-md px-3 py-2 text-left text-xs outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11 ${item.danger ? 'text-rose-300 hover:bg-rose-500/10 focus-visible:bg-rose-500/10' : 'text-slate-200 hover:bg-white/5 focus-visible:bg-violet-400/15'}`} onClick={() => {
          if (disabled || item.disabled) return
          close(); item.onSelect()
        }}>
          <span className="block">{item.label}</span>
          {item.disabled && item.disabledReason && <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{item.disabledReason}</span>}
        </button>
      </div>)}</div>
    </div>
  </>
}

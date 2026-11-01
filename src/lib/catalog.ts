import type { SystemDefinition } from '../types/system'

// On edit, preserve the existing inactive selection; new selections must be active.
export function selectableSystems(items: SystemDefinition[], currentId?: number): SystemDefinition[] {
  return items.filter((item) => item.active || item.id === currentId)
}

export function systemLabel(item: SystemDefinition): string {
  return `${item.name}${item.active ? '' : ' — Pasif, mevcut seçim'}`
}

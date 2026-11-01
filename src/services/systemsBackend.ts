import { del, get, patch, post, put } from './api.ts'
import type { SystemInput, SystemDefinition } from '../types/system'

export function listSystems(active?: boolean): Promise<SystemDefinition[]> {
  const query = active === undefined ? '' : `?active=${active}`
  return get<SystemDefinition[]>(`/systems${query}`)
}

export const fetchSystem = (id: number) => get<SystemDefinition>(`/systems/${id}`)

// Fetch active choices once. Existing inactive systems remain available only
// in their saved roles; the form applies that restriction to each selector.
export async function fetchSelectableSystems(existingIds: (number | null | undefined)[] = []): Promise<SystemDefinition[]> {
  const active = await listSystems(true)
  const missing = [...new Set(existingIds.filter((id): id is number => id != null && !active.some((system) => system.id === id)))]
  const existing = await Promise.all(missing.map(fetchSystem))
  return [...active, ...existing]
}

export const createSystem = (input: SystemInput) => post<SystemDefinition>('/systems', { name: input.name.trim(), description: input.description })
export const updateSystem = (id: number, input: SystemInput) => put<SystemDefinition>(`/systems/${id}`, { name: input.name.trim(), description: input.description })
export const setSystemActive = (id: number, active: boolean) => patch<SystemDefinition>(`/systems/${id}/active`, { active })
export const deleteSystem = (id: number) => del(`/systems/${id}`)

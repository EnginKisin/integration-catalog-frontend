import catalog from '../data/serviceCatalog.json'
import type { IntegrationRecord } from '../types/integration'

const STORAGE_KEY = 'vibe-integration-catalog-data'

const initialData = catalog as IntegrationRecord[]

function readStorage(): IntegrationRecord[] {
  if (typeof window === 'undefined') {
    return initialData
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData))
    return initialData
  }

  try {
    return JSON.parse(stored) as IntegrationRecord[]
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData))
    return initialData
  }
}

function writeStorage(records: IntegrationRecord[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }
}

export async function fetchIntegrations(): Promise<IntegrationRecord[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(readStorage()), 250)
  })
}

export async function createIntegration(newIntegration: Omit<IntegrationRecord, 'id' | 'status' | 'lastUpdated'>): Promise<IntegrationRecord> {
  const existing = readStorage()
  const record: IntegrationRecord = {
    ...newIntegration,
    id: `INT-${String(existing.length + 1).padStart(3, '0')}`,
    status: 'pending',
    lastUpdated: 'şimdi',
  }
  const updated = [record, ...existing]
  writeStorage(updated)
  return new Promise((resolve) => {
    setTimeout(() => resolve(record), 300)
  })
}

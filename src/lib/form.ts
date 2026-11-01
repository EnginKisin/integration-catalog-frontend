import type { FormEvent } from 'react'
import type { SaveIntent } from './integrationWorkflow'

export function saveIntent(event: FormEvent<HTMLFormElement>): SaveIntent {
  const submitter = (event.nativeEvent as SubmitEvent).submitter
  return submitter instanceof HTMLButtonElement && (submitter.value === 'stay' || submitter.value === 'exit') ? submitter.value : 'next'
}

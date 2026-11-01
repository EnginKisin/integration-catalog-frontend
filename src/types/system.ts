export interface SystemInput {
  name: string
  description: string
}

export interface SystemDefinition extends SystemInput {
  id: number
  active: boolean
  usageCount: number
}

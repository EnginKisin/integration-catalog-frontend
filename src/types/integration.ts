export type SyncType = 'sync' | 'async'
export type PayloadFormat = 'json' | 'xml' | 'idoc'
export type StatusType = 'active' | 'pending' | 'paused'
export type MappingType = 'ai' | 'manual'

export interface ManualMapping {
  id: string
  sourceField: string
  destinationField: string
  mappingType: MappingType
  transformationRule?: string
}

export interface IntegrationRecord {
  id: string
  serviceName: string
  sourceSystem: string
  destinationSystem: string
  middleware?: string
  syncType: SyncType
  formatSource: PayloadFormat
  formatDestination: PayloadFormat
  retryPolicy: string
  retryCount?: string
  retryInterval?: string
  authenticationType?: string
  authDetails?: {
    username?: string
    password?: string
    clientId?: string
    clientSecret?: string
    apiKey?: string
  }
  destinationRetryCount?: string
  destinationRetryInterval?: string
  destinationTimeout?: string
  destinationAuthenticationType?: string
  destinationAuthDetails?: {
    username?: string
    password?: string
    clientId?: string
    clientSecret?: string
    apiKey?: string
  }
  middlewareRetryCount?: string
  middlewareRetryInterval?: string
  middlewareTimeout?: string
  middlewareAuthenticationType?: string
  middlewareAuthDetails?: {
    username?: string
    password?: string
    clientId?: string
    clientSecret?: string
    apiKey?: string
  }
  status: StatusType
  lastUpdated: string
  timeout?: string
  sourceEnvironments?: Record<'test' | 'dev' | 'prod', { enabled: boolean; url: string }>
  destinationEnvironments?: Record<'test' | 'dev' | 'prod', { enabled: boolean; url: string }>
  middlewareEnvironments?: Record<'test' | 'dev' | 'prod', { enabled: boolean; url: string }>
  sourceExample?: string
  destinationExample?: string
  sourceToMiddlewareRequest?: string
  middlewareToDestinationRequest?: string
  middlewareResponseExample?: string
  destinationResponseExample?: string
  sourceToDestinationRequest?: string
  destinationToSourceResponse?: string
  destinationToMiddlewareResponse?: string
  middlewareToSourceResponse?: string
  manualMappings?: ManualMapping[]
}

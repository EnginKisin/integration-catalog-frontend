import { useMemo, useState, useEffect } from 'react'
import MappingCanvas from './MappingCanvas'
import type { Dispatch, SetStateAction } from 'react'
import type { IntegrationRecord, ManualMapping, PayloadFormat, SyncType } from '../../types/integration'
import { createIntegration } from '../../services/fakeBackend'

interface CreateIntegrationProps {
  onCreated: (record: IntegrationRecord) => void
  onCancel: () => void
}

const formats: PayloadFormat[] = ['json', 'xml', 'idoc']
const syncTypes: SyncType[] = ['sync', 'async']
const environmentOptions = ['test', 'dev', 'prod'] as const
const authTypes = ['OAuth 2.0', 'Basic Auth', 'API Key', 'None'] as const

type EnvironmentOption = (typeof environmentOptions)[number]
type AuthType = (typeof authTypes)[number]
type EnvironmentState = Record<EnvironmentOption, { enabled: boolean; url: string }>

const createEnvironmentState = (): EnvironmentState => ({
  test: { enabled: false, url: '' },
  dev: { enabled: false, url: '' },
  prod: { enabled: false, url: '' },
})

const createMappingRow = (): ManualMapping => ({
  id: crypto?.randomUUID?.() ?? String(Date.now()),
  sourceField: '',
  destinationField: '',
  mappingType: 'manual',
  transformationRule: '',
})

const stepLabels = ['Servis Bilgileri', 'Ortam ve Teknik Bilgiler', 'Request / Response & Mapping']

const parsePayloadFields = (value: string): string[] => {
  if (!value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    const fields: string[] = []
    const walk = (node: unknown, prefix = '') => {
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, `${prefix}[0]`))
        return
      }
      if (node && typeof node === 'object') {
        Object.entries(node).forEach(([key, child]) => walk(child, prefix ? `${prefix}.${key}` : key))
        return
      }
      if (prefix) fields.push(prefix)
    }
    walk(parsed)
    return fields
  } catch {
    const tags = Array.from(value.matchAll(/<([A-Za-z0-9_:-]+)>/g)).map((match) => match[1])
    return Array.from(new Set(tags)).slice(0, 20)
  }
}

const buildAiSuggestion = (sourceExample: string, destinationExample: string): ManualMapping[] => {
  const sourceFields = parsePayloadFields(sourceExample)
  const destinationFields = parsePayloadFields(destinationExample)
  if (sourceFields.length && destinationFields.length) {
    return sourceFields.slice(0, 5).map((sourceField, index) => ({
      ...createMappingRow(),
      sourceField,
      destinationField: destinationFields[index] ?? destinationFields[0] ?? '',
      mappingType: 'ai',
    }))
  }

  return [
    {
      ...createMappingRow(),
      sourceField: 'sourceField',
      destinationField: 'destinationField',
      mappingType: 'ai',
    },
  ]
}

export function CreateIntegration({ onCreated, onCancel }: CreateIntegrationProps) {
  const [serviceName, setServiceName] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [sourceSystem, setSourceSystem] = useState('')
  const [destinationSystem, setDestinationSystem] = useState('')
  const [middleware, setMiddleware] = useState('')
  const [hasMiddleware, setHasMiddleware] = useState(false)
  const [syncType, setSyncType] = useState<SyncType>('sync')
  const [formatSource, setFormatSource] = useState<PayloadFormat>('json')
  const [formatDestination, setFormatDestination] = useState<PayloadFormat>('json')
  const [destinationEnvironments, setDestinationEnvironments] = useState<EnvironmentState>(createEnvironmentState())
  const [destinationRetryCount, setDestinationRetryCount] = useState('3')
  const [destinationRetryInterval, setDestinationRetryInterval] = useState('30s')
  const [destinationTimeout, setDestinationTimeout] = useState('60s')
  const [destinationAuthenticationType, setDestinationAuthenticationType] = useState<AuthType>('OAuth 2.0')
  const [destinationAuthUsername, setDestinationAuthUsername] = useState('')
  const [destinationAuthPassword, setDestinationAuthPassword] = useState('')
  const [destinationAuthClientId, setDestinationAuthClientId] = useState('')
  const [destinationAuthClientSecret, setDestinationAuthClientSecret] = useState('')
  const [destinationAuthApiKey, setDestinationAuthApiKey] = useState('')
  const [middlewareEnvironments, setMiddlewareEnvironments] = useState<EnvironmentState>(createEnvironmentState())
  const [middlewareRetryCount, setMiddlewareRetryCount] = useState('3')
  const [middlewareRetryInterval, setMiddlewareRetryInterval] = useState('30s')
  const [middlewareTimeout, setMiddlewareTimeout] = useState('60s')
  const [middlewareAuthenticationType, setMiddlewareAuthenticationType] = useState<AuthType>('OAuth 2.0')
  const [middlewareAuthUsername, setMiddlewareAuthUsername] = useState('')
  const [middlewareAuthPassword, setMiddlewareAuthPassword] = useState('')
  const [middlewareAuthClientId, setMiddlewareAuthClientId] = useState('')
  const [middlewareAuthClientSecret, setMiddlewareAuthClientSecret] = useState('')
  const [middlewareAuthApiKey, setMiddlewareAuthApiKey] = useState('')
  const [sourceToDestinationRequest, setSourceToDestinationRequest] = useState('')
  const [destinationToSourceResponse, setDestinationToSourceResponse] = useState('')
  const [sourceToMiddlewareRequest, setSourceToMiddlewareRequest] = useState('')
  const [middlewareToDestinationRequest, setMiddlewareToDestinationRequest] = useState('')
  const [destinationToMiddlewareResponse, setDestinationToMiddlewareResponse] = useState('')
  const [middlewareToSourceResponse, setMiddlewareToSourceResponse] = useState('')
  const [currentStep, setCurrentStep] = useState(1)
  const [mappingMode, setMappingMode] = useState<'ai' | 'manual'>('manual')
  const [manualMappings, setManualMappings] = useState<ManualMapping[]>([createMappingRow()])
  const [isSaving, setIsSaving] = useState(false)

  const destinationAuthFieldsValid = () => {
    if (destinationAuthenticationType === 'Basic Auth') {
      return !!destinationAuthUsername.trim() && !!destinationAuthPassword.trim()
    }
    if (destinationAuthenticationType === 'OAuth 2.0') {
      return !!destinationAuthClientId.trim() && !!destinationAuthClientSecret.trim()
    }
    if (destinationAuthenticationType === 'API Key') {
      return !!destinationAuthApiKey.trim()
    }
    return true
  }

  const middlewareAuthFieldsValid = () => {
    if (middlewareAuthenticationType === 'Basic Auth') {
      return !!middlewareAuthUsername.trim() && !!middlewareAuthPassword.trim()
    }
    if (middlewareAuthenticationType === 'OAuth 2.0') {
      return !!middlewareAuthClientId.trim() && !!middlewareAuthClientSecret.trim()
    }
    if (middlewareAuthenticationType === 'API Key') {
      return !!middlewareAuthApiKey.trim()
    }
    return true
  }

  const canSave = useMemo(() => {
    if (!serviceName.trim() || !sourceSystem.trim() || !destinationSystem.trim()) return false
    if (!destinationRetryCount.trim() || !destinationRetryInterval.trim() || !destinationAuthenticationType.trim()) return false
    if (!destinationAuthFieldsValid()) return false
    if (hasMiddleware) {
      if (!middlewareRetryCount.trim() || !middlewareRetryInterval.trim() || !middlewareAuthenticationType.trim()) return false
      if (!middlewareAuthFieldsValid()) return false
    }
    return true
  }, [
    serviceName,
    sourceSystem,
    destinationSystem,
    destinationRetryCount,
    destinationRetryInterval,
    destinationAuthenticationType,
    destinationAuthUsername,
    destinationAuthPassword,
    destinationAuthClientId,
    destinationAuthClientSecret,
    destinationAuthApiKey,
    hasMiddleware,
    middlewareRetryCount,
    middlewareRetryInterval,
    middlewareAuthenticationType,
    middlewareAuthUsername,
    middlewareAuthPassword,
    middlewareAuthClientId,
    middlewareAuthClientSecret,
    middlewareAuthApiKey,
  ])

  const sampleRequest = hasMiddleware ? sourceToMiddlewareRequest : sourceToDestinationRequest
  const sampleDestination = hasMiddleware ? middlewareToDestinationRequest : destinationToSourceResponse
  const aiEnabled = !!sampleRequest.trim()
  const sourceTreeFields = useMemo(() => parsePayloadFields(sampleRequest), [sampleRequest])
  const destinationTreeFields = useMemo(() => parsePayloadFields(sampleDestination), [sampleDestination])

  // Middleware deactive olursa step 3'ten step 2'ye dön
  useEffect(() => {
    if (!hasMiddleware && currentStep === 3) {
      setCurrentStep(2)
    }
  }, [hasMiddleware, currentStep])

  const hasSelectedEnvironment = (envState: EnvironmentState) =>
    Object.values(envState).some((env) => env.enabled)

  const hasValidEnvironmentUrls = (envState: EnvironmentState) =>
    Object.values(envState).every((env) => !env.enabled || !!env.url.trim())

  const updateEnvironmentEnabled = (
    setter: Dispatch<SetStateAction<EnvironmentState>>,
    key: EnvironmentOption,
    enabled: boolean,
  ) => {
    setter((current) => ({
      ...current,
      [key]: {
        ...current[key],
        enabled,
      },
    }))
  }

  const updateEnvironmentUrl = (
    setter: Dispatch<SetStateAction<EnvironmentState>>,
    key: EnvironmentOption,
    url: string,
  ) => {
    setter((current) => ({
      ...current,
      [key]: {
        ...current[key],
        url,
      },
    }))
  }

  const handleGenerateAiMapping = () => {
    if (!aiEnabled) return
    setManualMappings(buildAiSuggestion(sampleRequest, sampleDestination))
    setMappingMode('manual')
  }

  const canAdvanceFromStep = (step: number) => {
    if (step === 1) {
      return !!serviceName.trim() && !!serviceDescription.trim() && !!sourceSystem.trim() && !!destinationSystem.trim()
    }
    if (step === 2) {
      return (
        hasSelectedEnvironment(destinationEnvironments) &&
        hasValidEnvironmentUrls(destinationEnvironments) &&
        (!!destinationRetryCount.trim() && !!destinationRetryInterval.trim()) &&
        !!destinationAuthenticationType.trim() &&
        destinationAuthFieldsValid() &&
        (!hasMiddleware || (hasSelectedEnvironment(middlewareEnvironments) && hasValidEnvironmentUrls(middlewareEnvironments)))
      )
    }
    return true
  }

  const handleSubmit = async () => {
    if (!canSave) return
    setIsSaving(true)

    const newRecord = await createIntegration({
      serviceName,
      sourceSystem,
      destinationSystem,
      middleware: hasMiddleware ? middleware : undefined,
      syncType,
      formatSource,
      formatDestination,
      retryPolicy: hasMiddleware
        ? `Destination: ${destinationRetryCount} retries / ${destinationRetryInterval}, Middleware: ${middlewareRetryCount} retries / ${middlewareRetryInterval}`
        : `Destination: ${destinationRetryCount} retries / ${destinationRetryInterval}`,
      destinationRetryCount,
      destinationRetryInterval,
      destinationTimeout,
      destinationAuthenticationType,
      destinationAuthDetails: {
        username: destinationAuthUsername,
        password: destinationAuthPassword,
        clientId: destinationAuthClientId,
        clientSecret: destinationAuthClientSecret,
        apiKey: destinationAuthApiKey,
      },
      middlewareRetryCount: hasMiddleware ? middlewareRetryCount : undefined,
      middlewareRetryInterval: hasMiddleware ? middlewareRetryInterval : undefined,
      middlewareTimeout: hasMiddleware ? middlewareTimeout : undefined,
      middlewareAuthenticationType: hasMiddleware ? middlewareAuthenticationType : undefined,
      middlewareAuthDetails: hasMiddleware
        ? {
            username: middlewareAuthUsername,
            password: middlewareAuthPassword,
            clientId: middlewareAuthClientId,
            clientSecret: middlewareAuthClientSecret,
            apiKey: middlewareAuthApiKey,
          }
        : undefined,
      destinationEnvironments,
      middlewareEnvironments: hasMiddleware ? middlewareEnvironments : undefined,
      sourceToMiddlewareRequest: hasMiddleware ? sourceToMiddlewareRequest : undefined,
      middlewareToDestinationRequest: hasMiddleware ? middlewareToDestinationRequest : undefined,
      destinationToMiddlewareResponse: hasMiddleware ? destinationToMiddlewareResponse : undefined,
      middlewareToSourceResponse: hasMiddleware ? middlewareToSourceResponse : undefined,
      sourceToDestinationRequest: !hasMiddleware ? sourceToDestinationRequest : undefined,
      destinationToSourceResponse: !hasMiddleware ? destinationToSourceResponse : undefined,
      manualMappings: manualMappings.filter((mapping) => mapping.sourceField || mapping.destinationField),
    })

    onCreated(newRecord)
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-border bg-surface2 p-6 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Yeni Entegrasyon Ekle</p>
          <h2 className="text-2xl font-semibold text-white">3 Adımlı Servis Tanımlama</h2>
          <p className="mt-2 text-sm text-slate-400">Servisi adım adım tanımlayın. Ortam bilgileri ve mapping adımları form akışına göre gösterilir.</p>
        </div>
        <button onClick={onCancel} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
          Geri Dön
        </button>
      </div>

      <div className="rounded-[2rem] border border-border bg-surface2 p-6 shadow-panel">
        <div className="space-y-6 rounded-[2rem]">
          <div className="grid gap-3 sm:grid-cols-3">
            {stepLabels.map((label, index) => {
              const step = index + 1
              // Step 3'ü (mapping) sadece middleware varsa göster
              if (step === 3 && !hasMiddleware) return null
              
              const active = step === currentStep
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCurrentStep(step)}
                  className={`flex items-center gap-3 rounded-3xl border px-4 py-3 text-left transition ${
                    active ? 'border-accent bg-accent/10 text-white' : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${active ? 'bg-accent text-slate-950' : 'border border-white/10 text-slate-400'}`}>
                    {step}
                  </span>
                  <div className="text-sm">
                    <p className="font-semibold">{label}</p>
                    <p className="text-xs text-slate-500">{step === 1 ? 'Temel bilgiler' : step === 2 ? 'Ortam & teknik' : 'Mapping adımı'}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="space-y-6 pt-4">
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-300">
                    Servis Adı
                    <input
                      value={serviceName}
                      onChange={(event) => setServiceName(event.target.value)}
                      placeholder="Customer 360 Sync"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Servis Açıklaması
                    <textarea
                      rows={3}
                      value={serviceDescription}
                      onChange={(event) => setServiceDescription(event.target.value)}
                      placeholder="Müşteri verilerinin CRM'den ERP'ye aktarımı"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Kaynak Sistem
                    <input
                      value={sourceSystem}
                      onChange={(event) => setSourceSystem(event.target.value)}
                      placeholder="Salesforce CRM"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Hedef Sistem
                    <input
                      value={destinationSystem}
                      onChange={(event) => setDestinationSystem(event.target.value)}
                      placeholder="SAP S/4HANA"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-2 text-sm text-slate-300">
                    Kaynak Format
                    <select
                      value={formatSource}
                      onChange={(event) => setFormatSource(event.target.value as PayloadFormat)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    >
                      {formats.map((option) => (
                        <option key={option} value={option} className="bg-slate-950 text-white">
                          {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Hedef Format
                    <select
                      value={formatDestination}
                      onChange={(event) => setFormatDestination(event.target.value as PayloadFormat)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    >
                      {formats.map((option) => (
                        <option key={option} value={option} className="bg-slate-950 text-white">
                          {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Senkronizasyon Tipi
                    <select
                      value={syncType}
                      onChange={(event) => setSyncType(event.target.value as SyncType)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    >
                      {syncTypes.map((option) => (
                        <option key={option} value={option} className="bg-slate-950 text-white">
                          {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <section className="space-y-4 rounded-3xl border border-border bg-slate-950/40 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Ara Katman</p>
                      <p className="text-sm text-slate-500">Kaynak ve hedef arasında ek bir middleware varsa işaretleyin.</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-3 rounded-full bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
                      <input
                        type="checkbox"
                        checked={hasMiddleware}
                        onChange={(event) => setHasMiddleware(event.target.checked)}
                        className="h-5 w-5 rounded border border-white/10 bg-slate-950/40 text-accent focus:ring-accent"
                      />
                      Var
                    </label>
                  </div>
                  {hasMiddleware && (
                    <label className="space-y-2 text-sm text-slate-300">
                      Middleware Adı
                      <input
                        value={middleware}
                        onChange={(event) => setMiddleware(event.target.value)}
                        placeholder="MuleSoft Anypoint"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  )}
                </section>
              </div>
            )}
            {currentStep === 2 && (
              <div className="space-y-6">
                {/* Environments moved into Destination Technical Details below to avoid duplication/mislabeling */}

                <section className="space-y-4 rounded-3xl border border-border bg-slate-950/40 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Destination Teknik Bilgileri</p>
                      <p className="text-sm text-slate-500">Destination için auth, retry ve timeout ayarlarını girin.</p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {environmentOptions.map((env) => (
                      <div key={env} className="space-y-2 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                        <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={destinationEnvironments[env].enabled}
                            onChange={(event) => updateEnvironmentEnabled(setDestinationEnvironments, env, event.target.checked)}
                            className="h-5 w-5 rounded border border-white/10 bg-slate-950/40 text-accent focus:ring-accent"
                          />
                          {env.toUpperCase()}
                        </label>
                        {destinationEnvironments[env].enabled && (
                          <input
                            value={destinationEnvironments[env].url}
                            onChange={(event) => updateEnvironmentUrl(setDestinationEnvironments, env, event.target.value)}
                            placeholder={`https://destination-${env}.example.com`}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2 text-sm text-slate-300">
                      Retry Sayısı
                      <input
                        type="number"
                        min="0"
                        value={destinationRetryCount}
                        onChange={(event) => setDestinationRetryCount(event.target.value)}
                        placeholder="3"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Retry Aralığı
                      <input
                        value={destinationRetryInterval}
                        onChange={(event) => setDestinationRetryInterval(event.target.value)}
                        placeholder="30s"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Timeout
                      <input
                        value={destinationTimeout}
                        onChange={(event) => setDestinationTimeout(event.target.value)}
                        placeholder="60s"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-300">
                      Destination Authentication Type
                      <select
                        value={destinationAuthenticationType}
                        onChange={(event) => setDestinationAuthenticationType(event.target.value as AuthType)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      >
                        {authTypes.map((option) => (
                          <option key={option} value={option} className="bg-slate-950 text-white">
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {destinationAuthenticationType === 'Basic Auth' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm text-slate-300">
                        Username
                        <input
                          value={destinationAuthUsername}
                          onChange={(event) => setDestinationAuthUsername(event.target.value)}
                          placeholder="username"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        Password
                        <input
                          type="password"
                          value={destinationAuthPassword}
                          onChange={(event) => setDestinationAuthPassword(event.target.value)}
                          placeholder="password"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                    </div>
                  )}
                  {destinationAuthenticationType === 'OAuth 2.0' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm text-slate-300">
                        Client ID
                        <input
                          value={destinationAuthClientId}
                          onChange={(event) => setDestinationAuthClientId(event.target.value)}
                          placeholder="client-id"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        Client Secret
                        <input
                          value={destinationAuthClientSecret}
                          onChange={(event) => setDestinationAuthClientSecret(event.target.value)}
                          placeholder="client-secret"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                    </div>
                  )}
                  {destinationAuthenticationType === 'API Key' && (
                    <label className="space-y-2 text-sm text-slate-300">
                      API Key
                      <input
                        value={destinationAuthApiKey}
                        onChange={(event) => setDestinationAuthApiKey(event.target.value)}
                        placeholder="api-key"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  )}
                  {/* Hedef Erişim Bilgisi removed — handled via authentication fields above */}
                </section>

                {hasMiddleware ? (
                  <section className="space-y-4 rounded-3xl border border-border bg-slate-950/40 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Middleware Ortamlar</p>
                        <p className="text-sm text-slate-500">Middleware için de seçilebilir ortamlar ve URL bilgilerini girin.</p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {environmentOptions.map((env) => (
                        <div key={env} className="space-y-2 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
                          <label className="inline-flex items-center gap-3 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={middlewareEnvironments[env].enabled}
                              onChange={(event) => updateEnvironmentEnabled(setMiddlewareEnvironments, env, event.target.checked)}
                              className="h-5 w-5 rounded border border-white/10 bg-slate-950/40 text-accent focus:ring-accent"
                            />
                            {env.toUpperCase()}
                          </label>
                          {middlewareEnvironments[env].enabled && (
                            <input
                              value={middlewareEnvironments[env].url}
                              onChange={(event) => updateEnvironmentUrl(setMiddlewareEnvironments, env, event.target.value)}
                              placeholder={`https://middleware-${env}.example.com`}
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Middleware Erişim Bilgisi removed — handled via authentication fields above */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="space-y-2 text-sm text-slate-300">
                        Middleware Retry Sayısı
                        <input
                          type="number"
                          min="0"
                          value={middlewareRetryCount}
                          onChange={(event) => setMiddlewareRetryCount(event.target.value)}
                          placeholder="3"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        Middleware Retry Aralığı
                        <input
                          value={middlewareRetryInterval}
                          onChange={(event) => setMiddlewareRetryInterval(event.target.value)}
                          placeholder="30s"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        Middleware Timeout
                        <input
                          value={middlewareTimeout}
                          onChange={(event) => setMiddlewareTimeout(event.target.value)}
                          placeholder="60s"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm text-slate-300">
                        Middleware Authentication Type
                        <select
                          value={middlewareAuthenticationType}
                          onChange={(event) => setMiddlewareAuthenticationType(event.target.value as AuthType)}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        >
                          {authTypes.map((option) => (
                            <option key={option} value={option} className="bg-slate-950 text-white">
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {middlewareAuthenticationType === 'Basic Auth' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm text-slate-300">
                          Username
                          <input
                            value={middlewareAuthUsername}
                            onChange={(event) => setMiddlewareAuthUsername(event.target.value)}
                            placeholder="username"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        </label>
                        <label className="space-y-2 text-sm text-slate-300">
                          Password
                          <input
                            type="password"
                            value={middlewareAuthPassword}
                            onChange={(event) => setMiddlewareAuthPassword(event.target.value)}
                            placeholder="password"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        </label>
                      </div>
                    )}

                    {middlewareAuthenticationType === 'OAuth 2.0' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm text-slate-300">
                          Client ID
                          <input
                            value={middlewareAuthClientId}
                            onChange={(event) => setMiddlewareAuthClientId(event.target.value)}
                            placeholder="client-id"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        </label>
                        <label className="space-y-2 text-sm text-slate-300">
                          Client Secret
                          <input
                            value={middlewareAuthClientSecret}
                            onChange={(event) => setMiddlewareAuthClientSecret(event.target.value)}
                            placeholder="client-secret"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        </label>
                      </div>
                    )}

                    {middlewareAuthenticationType === 'API Key' && (
                      <label className="space-y-2 text-sm text-slate-300">
                        API Key
                        <input
                          value={middlewareAuthApiKey}
                          onChange={(event) => setMiddlewareAuthApiKey(event.target.value)}
                          placeholder="api-key"
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                    )}
                  </section>
                ) : (
                  <div className="rounded-3xl border border-border bg-slate-950/40 p-5">
                    <p className="text-sm font-semibold text-white">Source → Destination Bilgileri</p>
                    <p className="mt-2 text-sm text-slate-400">Middleware olmadığı için sadece kaynak ve hedef ortamlarını ekleyebilirsiniz.</p>
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && hasMiddleware && (
              <div className="space-y-6">
                {hasMiddleware ? (
                  <div className="grid gap-4">
                    <label className="space-y-2 text-sm text-slate-300">
                      Source → Middleware İstek Örneği
                      <textarea
                        rows={6}
                        value={sourceToMiddlewareRequest}
                        onChange={(event) => setSourceToMiddlewareRequest(event.target.value)}
                        placeholder='{"customer": {"id": "12345"}}'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Middleware → Destination İstek Örneği
                      <textarea
                        rows={6}
                        value={middlewareToDestinationRequest}
                        onChange={(event) => setMiddlewareToDestinationRequest(event.target.value)}
                        placeholder='<IDOC><CUSTOMER><ID>12345</ID></CUSTOMER></IDOC>'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Destination → Middleware Yanıt Örneği
                      <textarea
                        rows={5}
                        value={destinationToMiddlewareResponse}
                        onChange={(event) => setDestinationToMiddlewareResponse(event.target.value)}
                        placeholder='{"status": "OK", "message": "Processed"}'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Middleware → Source Yanıt Örneği
                      <textarea
                        rows={5}
                        value={middlewareToSourceResponse}
                        onChange={(event) => setMiddlewareToSourceResponse(event.target.value)}
                        placeholder='{"success": true, "message": "Returned to source"}'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <label className="space-y-2 text-sm text-slate-300">
                      Source → Destination İstek Örneği
                      <textarea
                        rows={6}
                        value={sourceToDestinationRequest}
                        onChange={(event) => setSourceToDestinationRequest(event.target.value)}
                        placeholder='{"customer": {"id": "12345", "email": "info@acme.com"}}'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      Destination → Source Yanıt Örneği
                      <textarea
                        rows={6}
                        value={destinationToSourceResponse}
                        onChange={(event) => setDestinationToSourceResponse(event.target.value)}
                        placeholder='{"status": "OK", "message": "Returned to source"}'
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  </div>
                )}
                <section className="space-y-4 rounded-3xl border border-border bg-slate-950/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Mapping Modu</p>
                      <p className="text-sm text-slate-500">AI ve manuel eşleme seçenekleri arasında geçiş yapabilirsiniz.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateAiMapping}
                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${mappingMode === 'ai' ? 'bg-accent text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        AI Mapping
                      </button>
                      <button
                        type="button"
                        onClick={() => setMappingMode('manual')}
                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${mappingMode === 'manual' ? 'bg-accent text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        Manual Mapping
                      </button>
                    </div>
                  </div>
                  {mappingMode === 'ai' ? (
                    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                      <p className="text-sm font-semibold text-white">AI Önerisi</p>
                      <p className="text-sm text-slate-400">
                        {aiEnabled
                          ? 'Örnek istek mevcut. AI otomatik eşleme önerisi oluşturabilirsiniz.'
                          : 'AI mapping için kaynak isteği girilmelidir.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateAiMapping}
                        disabled={!aiEnabled}
                        className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:bg-white/10"
                      >
                        AI Öneri Üret
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                      <div className="space-y-4">
                        <MappingCanvas
                          sourceFields={sourceTreeFields}
                          destinationFields={destinationTreeFields}
                          mappings={manualMappings}
                          onConnect={(sourceField, destinationField) =>
                            setManualMappings((current) => [
                              ...current,
                              {
                                ...createMappingRow(),
                                sourceField,
                                destinationField,
                                mappingType: 'manual',
                              },
                            ])
                          }
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              disabled={currentStep === 1}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Geri
            </button>
            {currentStep < (hasMiddleware ? 3 : 2) ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.min(hasMiddleware ? 3 : 2, prev + 1))}
                disabled={!canAdvanceFromStep(currentStep)}
                className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:bg-white/10"
              >
                Sonraki Adım
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave || isSaving}
                className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:bg-white/10"
              >
                {isSaving ? 'Kaydediliyor…' : 'Entegrasyonu Kaydet'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

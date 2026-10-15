import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ApiErrorCode,
  ApiPublicBusArrivalsResponse,
  ApiShuttleArrivalsResponse,
  ApiShuttleServiceWindowsResponse,
  PublicBusArrivalSnapshot,
  ShuttleServiceWindow,
} from '@navus/shared'
import type { BackendConfig } from '../config.ts'
import type { BackendData } from '../data.ts'
import { createNusAuthenticatedClient, NusRequestError, type NusApiRequest, type NusApiSession } from './nus-client.ts'
import { createShuttleArrivalSnapshotStore, type ShuttleArrivalStop, type ShuttleArrivalStopResult } from './snapshot.ts'
import { parseShuttleServiceResponse } from './shuttle-response.ts'
import { parseRequestedStops } from './shuttle-request.ts'
import { parseRouteServiceWindows } from './service-window-response.ts'
import { mapWithConcurrency } from './concurrency.ts'
import { fetchWithRetry } from './retry.ts'
import { createLtaPublicBusArrivalProvider } from './lta/server.ts'
import { parseLtaPublicBusStopMapping, type LtaPublicBusStopMapping } from './lta/mapping.ts'
import { parseRequestedLtaStops } from './lta/request.ts'
import { createLtaScheduleLoader } from './lta/schedule.ts'

const SERVICE_WINDOWS_CACHE_TTL_MS = 600_000

interface CachedServiceWindows {
  readonly observedAt: string
  readonly expiresAt: string
  readonly windows: readonly ShuttleServiceWindow[]
}

export interface BackendLiveData {
  isSnapshotReady(): boolean
  getShuttleArrivals(stopsQuery: string | null): ApiShuttleArrivalsResponse
  getServiceWindows(routesQuery: string | null): Promise<ApiShuttleServiceWindowsResponse>
  getPublicBusArrivals(stopsQuery: string | null): Promise<ApiPublicBusArrivalsResponse>
  start(): void
  stop(): Promise<void>
}

export class LiveDataRequestError extends Error {
  readonly status: number
  readonly code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'LiveDataRequestError'
    this.status = status
    this.code = code
  }
}

interface BackendLiveDataOptions {
  readonly fetcher?: typeof fetch
  readonly now?: () => number
  readonly ltaMappings?: readonly LtaPublicBusStopMapping[]
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function requestError(error: unknown, fallback: string): LiveDataRequestError {
  return new LiveDataRequestError(
    400,
    'invalid_request',
    error instanceof Error ? error.message : fallback,
  )
}

function parseRouteIds(value: string | null, canonicalRouteIds: readonly string[]): readonly string[] {
  if (!value) throw new Error('The routes query is required')
  const parts = value.split(',').map((routeId) => routeId.trim())
  if (parts.length === 0 || parts.length > 16 || parts.some((routeId) => !/^[A-Za-z0-9_-]{1,40}$/.test(routeId))) {
    throw new Error('The routes query must contain between 1 and 16 valid route IDs')
  }

  const canonical = new Set(canonicalRouteIds)
  const unique = [...new Set(parts)]
  for (const routeId of unique) {
    if (!canonical.has(routeId)) throw new Error('Unknown canonical bus route: ' + routeId)
  }
  return unique
}

async function readLtaMappings(dataDirectory: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(join(dataDirectory, 'lta-public-bus-stops.json'), 'utf8')
  } catch {
    throw new Error('Canonical LTA public bus mapping could not be read')
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Canonical LTA public bus mapping is not valid JSON')
  }
}

function createBusProxyRequest(
  provider: NonNullable<BackendConfig['liveData']['nusProvider']>,
  session: NusApiSession,
  deviceId: string,
  endpoint: string,
  extraBody: Record<string, string>,
): NusApiRequest {
  return {
    url: provider.busProxyBaseUrl + '/univus/api/bus-proxy/' + endpoint,
    init: {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.token,
        'Content-Type': 'application/json; charset=utf-8',
        'X-HTD-API': provider.htdApi,
        'X-APP-API': provider.appApi,
        'X-API-KEY': provider.apiKey,
      },
      body: JSON.stringify({
        ...extraBody,
        deviceid: deviceId,
        domain: session.domain,
        ipaddr: provider.ipaddr,
        token: session.token,
        userid: session.userId,
        version: provider.version,
      }),
    },
  }
}

function isRetryableNusError(error: unknown): boolean {
  if (!(error instanceof NusRequestError)) return false
  return error.status === null || error.status === 429 || error.status >= 500
}

async function retryNusRequest<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  attempts: number,
  baseDelayMs: number,
): Promise<T> {
  let retries = 0
  while (true) {
    try {
      return await operation()
    } catch (error: unknown) {
      if (!isRetryableNusError(error) || retries >= attempts || signal.aborted) throw error
      const delayMs = baseDelayMs * (2 ** retries)
      retries += 1
      if (delayMs === 0) continue
      await new Promise<void>((resolveDelay, rejectDelay) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolveDelay()
        }, delayMs)
        timer.unref?.()
        const abort = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          rejectDelay(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
        }
        signal.addEventListener('abort', abort, { once: true })
      })
    }
  }
}

export async function createBackendLiveData(
  config: BackendConfig,
  data: BackendData,
  options: BackendLiveDataOptions = {},
): Promise<BackendLiveData> {
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  const canonicalStops: readonly ShuttleArrivalStop[] = data.network.stops.map((stop) => ({
    stopId: stop.id,
    stopName: stop.longName,
  }))
  if (canonicalStops.length !== 33) {
    throw new Error('The live shuttle provider requires exactly 33 canonical stops')
  }
  const routeIds = data.network.routes.map((route) => route.id)
  const canonicalRouteIds = new Set(routeIds)
  const mappings = options.ltaMappings ?? parseLtaPublicBusStopMapping(
    await readLtaMappings(config.dataDirectory),
  )
  const canonicalStopIds = new Set(canonicalStops.map(({ stopId }) => stopId))
  if (mappings.some(({ stopId }) => !canonicalStopIds.has(stopId))) {
    throw new Error('LTA public bus mappings must reference canonical bus stops')
  }

  const providerConfig = config.liveData.nusProvider
  const deviceId = providerConfig?.deviceId || randomUUID()
  const nusClient = providerConfig
    ? createNusAuthenticatedClient({
      accessTokenUrl: providerConfig.accessTokenUrl,
      htdApi: providerConfig.htdApi,
      appApi: providerConfig.appApi,
      deviceId,
      ipaddr: providerConfig.ipaddr,
      version: providerConfig.version,
      initialToken: providerConfig.initialToken,
      initialUserId: providerConfig.initialUserId,
      initialDomain: providerConfig.initialDomain,
      requestTimeoutMs: config.liveData.requestTimeoutMs,
      fetcher,
    })
    : null

  const loadStop = async (
    stop: ShuttleArrivalStop,
    signal: AbortSignal,
  ): Promise<ShuttleArrivalStopResult> => {
    if (!nusClient || !providerConfig) throw new Error('NUS live-data provider is not configured')
    const payload = await retryNusRequest(() => nusClient.requestJson((session) => createBusProxyRequest(
      providerConfig,
      session,
      deviceId,
      'shuttle-service',
      { busstopname: stop.stopName },
    ), 'shuttle-service', signal), signal, config.liveData.retryAttempts, config.liveData.retryBaseDelayMs)
    const parsed = parseShuttleServiceResponse(payload)
    const routes = Object.fromEntries(parsed
      .filter(({ routeId }) => canonicalRouteIds.has(routeId))
      .map(({ routeId, arrival }) => [routeId, arrival]))
    const observedAtMs = now()
    return {
      observedAt: toIso(observedAtMs),
      expiresAt: toIso(observedAtMs + config.liveData.shuttleRefreshIntervalMs),
      routes,
    }
  }

  const snapshotStore = createShuttleArrivalSnapshotStore({
    stops: canonicalStops,
    loadStop,
    refreshIntervalMs: config.liveData.shuttleRefreshIntervalMs,
    maxConcurrency: config.liveData.maxConcurrency,
    now,
    onRefreshComplete(log, failures) {
      console.info('NUS shuttle arrival refresh completed.', log)
      if (failures.length > 0) {
        console.warn('NUS shuttle arrival refresh had failed stops.', {
          stopIds: failures.map(({ stopId }) => stopId),
          failureCount: failures.length,
        })
      }
    },
  })

  const shutdownController = new AbortController()
  const serviceWindowCache = new Map<string, CachedServiceWindows>()
  // Shared cache loads outlive individual callers and are cancelled when Express stops.
  const serviceWindowInFlight = new Map<string, Promise<CachedServiceWindows | null>>()
  const activeOperations = new Set<Promise<unknown>>()
  const track = <Value>(operation: Promise<Value>): Promise<Value> => {
    activeOperations.add(operation)
    void operation.finally(() => activeOperations.delete(operation)).catch(() => undefined)
    return operation
  }

  const loadServiceWindows = (
    routeId: string,
    signal: AbortSignal,
  ): Promise<CachedServiceWindows | null> => {
    const cached = serviceWindowCache.get(routeId)
    if (cached && Date.parse(cached.expiresAt) > now()) return Promise.resolve(cached)
    const existing = serviceWindowInFlight.get(routeId)
    if (existing) return existing
    if (!nusClient || !providerConfig) return Promise.resolve(null)

    const request = (async (): Promise<CachedServiceWindows | null> => {
      try {
        const payload = await retryNusRequest(() => nusClient.requestJson((session) => createBusProxyRequest(
          providerConfig,
          session,
          deviceId,
          'route-min-max-time',
          { route_code: routeId },
        ), 'route-min-max-time', signal), signal, config.liveData.retryAttempts, config.liveData.retryBaseDelayMs)
        const observedAtMs = now()
        const entry = {
          observedAt: toIso(observedAtMs),
          expiresAt: toIso(observedAtMs + SERVICE_WINDOWS_CACHE_TTL_MS),
          windows: parseRouteServiceWindows(payload, routeId),
        }
        serviceWindowCache.set(routeId, entry)
        return entry
      } catch (error: unknown) {
        if (isAbortError(error)) throw error
        console.warn('NUS route service-hour data unavailable.', {
          routeId,
          errorType: error instanceof Error ? error.name : typeof error,
        })
        return null
      } finally {
        serviceWindowInFlight.delete(routeId)
      }
    })()
    serviceWindowInFlight.set(routeId, request)
    return request
  }

  const publicBusFetcher: typeof fetch = (input, init) => fetchWithRetry(
    fetcher,
    String(input),
    init ?? {},
    {
      timeoutMs: config.liveData.requestTimeoutMs,
      retryAttempts: config.liveData.retryAttempts,
      retryBaseDelayMs: config.liveData.retryBaseDelayMs,
      signal: init?.signal ?? undefined,
    },
  )

  const scheduleLoader = createLtaScheduleLoader({
    mappings,
    fetcher: async (url, signal) => {
      const response = await publicBusFetcher(url, {
        headers: { Accept: 'application/json', AccountKey: config.liveData.ltaAccountKey },
        signal,
      })
      if (!response.ok) throw new Error('LTA DataMall route request failed: ' + response.status)
      return response.json() as Promise<unknown>
    },
  })
  const ltaProvider = createLtaPublicBusArrivalProvider({
    accountKey: config.liveData.ltaAccountKey,
    mappings,
    scheduleLoader,
    now,
    fetcher: publicBusFetcher,
    maxConcurrency: config.liveData.maxConcurrency,
  })

  return {
    isSnapshotReady() {
      return snapshotStore.getSnapshot() !== null
    },
    getShuttleArrivals(stopsQuery) {
      const stops = (() => {
        try {
          return parseRequestedStops(stopsQuery, canonicalStops)
        } catch (error: unknown) {
          throw requestError(error, 'Invalid shuttle arrival request')
        }
      })()
      const snapshot = snapshotStore.getSnapshot()
      if (!snapshot) {
        throw new LiveDataRequestError(503, 'not_ready', 'Shuttle arrival snapshot is not ready')
      }
      const selected = {
        ...snapshot,
        stops: Object.fromEntries(stops.map((stop) => [
          stop.stopId,
          snapshot.stops[stop.stopId] ?? {},
        ])),
        stopObservations: Object.fromEntries(stops.flatMap((stop) => {
          const observation = snapshot.stopObservations?.[stop.stopId]
          return observation ? [[stop.stopId, observation]] : []
        })),
      } satisfies ApiShuttleArrivalsResponse
      return selected
    },
    getServiceWindows(routesQuery) {
      const routes = (() => {
        try {
          return parseRouteIds(routesQuery, routeIds)
        } catch (error: unknown) {
          throw requestError(error, 'Invalid shuttle service-window request')
        }
      })()
      const signal = shutdownController.signal
      const operation = (async (): Promise<ApiShuttleServiceWindowsResponse> => {
        const entries = await mapWithConcurrency(routes, config.liveData.maxConcurrency, async (routeId) => ({
          routeId,
          data: await loadServiceWindows(routeId, signal),
        }))
        if (entries.some(({ data: entry }) => entry === null)) {
          throw new LiveDataRequestError(503, 'provider_unavailable', 'Shuttle service-window data is unavailable')
        }
        const available = entries.flatMap(({ routeId, data: entry }) => entry ? [[routeId, entry] as const] : [])
        const observations = available.map(([, entry]) => Date.parse(entry.observedAt))
        const expiries = available.map(([, entry]) => Date.parse(entry.expiresAt))
        return {
          observedAt: toIso(Math.min(...observations)),
          expiresAt: toIso(Math.min(...expiries)),
          routes: Object.fromEntries(available.map(([routeId, entry]) => [routeId, entry.windows])),
        }
      })()
      return track(operation)
    },
    getPublicBusArrivals(stopsQuery) {
      const stops = (() => {
        try {
          return parseRequestedLtaStops(stopsQuery, mappings)
        } catch (error: unknown) {
          throw requestError(error, 'Invalid public bus arrival request')
        }
      })()
      if (!config.liveData.ltaAccountKey) {
        throw new LiveDataRequestError(503, 'provider_unavailable', 'LTA DataMall account key is not configured')
      }
      const operation = ltaProvider.getArrivals(stops, shutdownController.signal) as Promise<PublicBusArrivalSnapshot>
      return track(operation)
    },
    start() {
      snapshotStore.start()
    },
    async stop() {
      shutdownController.abort()
      await Promise.all([
        snapshotStore.stop(),
        ...[...activeOperations].map((operation) => Promise.resolve(operation).catch(() => undefined)),
      ])
    },
  }
}

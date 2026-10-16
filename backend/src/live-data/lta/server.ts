import { mapWithConcurrency } from '../concurrency.ts'
import type {
  PublicBusArrivalSnapshot,
  PublicBusEstimatedArrival,
  PublicBusServiceArrival,
  PublicBusStopArrivalData,
} from '@navus/shared'
import { PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS } from '@navus/shared'
import type { LtaPublicBusStopMapping } from './mapping.ts'
import { parseLtaBusArrivalResponse } from './response.ts'
import { type LtaScheduleLoader } from './schedule.ts'

export interface LtaPublicBusArrivalProvider {
  getArrivals(
    stops: readonly LtaPublicBusStopMapping[],
    signal: AbortSignal,
  ): Promise<PublicBusArrivalSnapshot>
}

interface CachedStop {
  readonly data: PublicBusStopArrivalData
  readonly expiresAtMs: number
}

interface LtaPublicBusArrivalProviderOptions {
  readonly accountKey: string
  readonly mappings: readonly LtaPublicBusStopMapping[]
  readonly scheduleLoader?: LtaScheduleLoader
  readonly baseUrl?: string
  readonly cacheTtlMs?: number
  readonly errorCacheTtlMs?: number
  readonly now?: () => number
  readonly fetcher?: typeof fetch
  readonly maxConcurrency?: number
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

function emptyService(status: PublicBusServiceArrival['status']): PublicBusServiceArrival {
  return { status, arrivals: [] }
}

function asFutureArrivals(arrivals: readonly PublicBusEstimatedArrival[], nowMs: number): readonly PublicBusEstimatedArrival[] {
  return arrivals
    .filter(({ estimatedAt }) => Date.parse(estimatedAt) > nowMs)
    .slice(0, 3)
}

export function createLtaPublicBusArrivalProvider(
  options: LtaPublicBusArrivalProviderOptions,
): LtaPublicBusArrivalProvider {
  const baseUrl = options.baseUrl ?? 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival'
  const cacheTtlMs = options.cacheTtlMs ?? PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS
  const errorCacheTtlMs = options.errorCacheTtlMs ?? 10_000
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  const maxConcurrency = options.maxConcurrency ?? 4
  const scheduleLoader = options.scheduleLoader
  const cache = new Map<string, CachedStop>()
  const inFlight = new Map<string, Promise<PublicBusStopArrivalData>>()

  const loadStop = async (
    mapping: LtaPublicBusStopMapping,
    signal: AbortSignal,
  ): Promise<PublicBusStopArrivalData> => {
    const requestStartedAt = now()
    try {
      if (!options.accountKey.trim()) throw new Error('LTA DataMall account key is not configured')
      const response = await fetcher(`${baseUrl}?BusStopCode=${encodeURIComponent(mapping.busStopCode)}`, {
        headers: { Accept: 'application/json', AccountKey: options.accountKey },
        signal,
      })
      if (!response.ok) throw new Error(`LTA DataMall request failed: ${response.status}`)
      const parsed = parseLtaBusArrivalResponse(await response.json() as unknown, mapping.services)
      const parsedByService = new Map(parsed.map((service) => [service.serviceNumber, service.arrivals]))
      const serviceEntries = await Promise.all(mapping.services.map(async (serviceNumber) => {
        const arrivals = asFutureArrivals(parsedByService.get(serviceNumber) ?? [], requestStartedAt)
        if (arrivals.length > 0) {
          return [serviceNumber, { status: 'live', arrivals }] as const
        }
        if (!scheduleLoader) return [serviceNumber, emptyService('no-estimate')] as const
        try {
          const operating = await scheduleLoader(serviceNumber, mapping.busStopCode, requestStartedAt, signal)
          return [serviceNumber, emptyService(operating === false ? 'not-in-operation' : 'no-estimate')] as const
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') throw error
          console.warn('LTA public bus schedule lookup failed.', {
            stopId: mapping.stopId,
            serviceNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          return [serviceNumber, emptyService('provider-error')] as const
        }
      }))
      const observedAtMs = now()
      const observedAt = toIso(observedAtMs)
      return {
        observedAt,
        expiresAt: toIso(observedAtMs + cacheTtlMs),
        services: Object.fromEntries(serviceEntries),
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      const observedAt = toIso(now())
      return {
        observedAt,
        expiresAt: toIso(Date.parse(observedAt) + errorCacheTtlMs),
        services: Object.fromEntries(mapping.services.map((service) => [service, emptyService('provider-error')])),
      }
    }
  }

  const getStop = (mapping: LtaPublicBusStopMapping, signal: AbortSignal): Promise<PublicBusStopArrivalData> => {
    const cached = cache.get(mapping.stopId)
    if (cached && cached.expiresAtMs > now()) return Promise.resolve(cached.data)
    const existing = inFlight.get(mapping.stopId)
    if (existing) return existing
    const request = loadStop(mapping, signal)
      .then((data) => {
        cache.set(mapping.stopId, { data, expiresAtMs: Date.parse(data.expiresAt) })
        return data
      })
      .finally(() => inFlight.delete(mapping.stopId))
    inFlight.set(mapping.stopId, request)
    return request
  }

  return {
    async getArrivals(stops, signal) {
      if (stops.length === 0) throw new Error('At least one public bus stop is required')
      const loaded = await mapWithConcurrency(stops, maxConcurrency, (stop) => getStop(stop, signal))
      const refreshedAt = toIso(now())
      const observationTimes = loaded.map(({ observedAt }) => Date.parse(observedAt))
      const expiryTimes = loaded.map(({ expiresAt }) => Date.parse(expiresAt))
      return {
        source: 'lta-datamall',
        observedAt: toIso(Math.min(...observationTimes)),
        expiresAt: toIso(Math.min(...expiryTimes)),
        refreshedAt,
        stops: Object.fromEntries(stops.map((stop, index) => [stop.stopId, loaded[index]])),
      }
    },
  }
}

import { buildApiUrl } from '../api/api-url'
import type {
  PublicBusArrivalSnapshot,
  PublicBusEstimatedArrival,
  PublicBusServiceArrival,
  PublicBusServiceArrivalStatus,
} from '../../domain/transit/public-bus-arrivals.js'
import {
  isOlderPublicBusArrivalSnapshot,
  PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS,
} from '../../domain/transit/public-bus-arrivals.js'
import type {
  PublicBusArrivalClient,
  PublicBusArrivalStopRequest,
} from '../../app/contracts/public-bus-arrivals.js'

export class PublicBusArrivalFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PublicBusArrivalFetchError'
  }
}

interface PublicBusArrivalClientOptions {
  readonly apiOrigin?: string
  readonly endpoint?: string
  readonly cacheTtlMs?: number
  readonly now?: () => number
  readonly fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Public bus arrival response has an invalid ${label}`)
  }
  return value
}

function parseStatus(value: unknown): PublicBusServiceArrivalStatus {
  if (value === 'live' || value === 'no-estimate' || value === 'not-in-operation' || value === 'provider-error') return value
  throw new Error('Public bus arrival response has an invalid status')
}

function parseService(value: unknown): PublicBusServiceArrival {
  if (!isRecord(value) || !Array.isArray(value.arrivals)) throw new Error('Public bus arrival response has an invalid service')
  const arrivals: PublicBusEstimatedArrival[] = value.arrivals.map((arrival) => {
    if (!isRecord(arrival)) throw new Error('Public bus arrival response has an invalid arrival')
    if (typeof arrival.monitored !== 'boolean') throw new Error('Public bus arrival response has an invalid monitored flag')
    return {
      estimatedAt: parseTimestamp(arrival.estimatedAt, 'estimatedAt'),
      monitored: arrival.monitored === true,
    }
  })
  return { status: parseStatus(value.status), arrivals }
}

function parseSnapshot(input: unknown): PublicBusArrivalSnapshot {
  if (!isRecord(input) || input.source !== 'lta-datamall' || !isRecord(input.stops)) {
    throw new Error('Public bus arrival response was invalid')
  }
  const observedAt = parseTimestamp(input.observedAt, 'observedAt')
  const expiresAt = parseTimestamp(input.expiresAt, 'expiresAt')
  const refreshedAt = parseTimestamp(input.refreshedAt, 'refreshedAt')
  if (Date.parse(expiresAt) <= Date.parse(observedAt)) throw new Error('Public bus arrival response has an invalid expiry range')

  const stops: Record<string, PublicBusArrivalSnapshot['stops'][string]> = {}
  for (const [stopId, stopValue] of Object.entries(input.stops)) {
    if (!isRecord(stopValue) || !isRecord(stopValue.services)) throw new Error(`Public bus arrival response has an invalid stop: ${stopId}`)
    const stopObservedAt = parseTimestamp(stopValue.observedAt, `${stopId}.observedAt`)
    const stopExpiresAt = parseTimestamp(stopValue.expiresAt, `${stopId}.expiresAt`)
    if (Date.parse(stopExpiresAt) <= Date.parse(stopObservedAt)) throw new Error(`Public bus arrival response has an invalid expiry range for ${stopId}`)
    const services: Record<string, PublicBusServiceArrival> = {}
    for (const [serviceNumber, serviceValue] of Object.entries(stopValue.services)) {
      services[serviceNumber] = parseService(serviceValue)
    }
    stops[stopId] = { observedAt: stopObservedAt, expiresAt: stopExpiresAt, services }
  }
  return { source: 'lta-datamall', observedAt, expiresAt, refreshedAt, stops }
}

function hasStops(snapshot: PublicBusArrivalSnapshot, stops: readonly PublicBusArrivalStopRequest[]): boolean {
  return stops.every((stop) => Object.prototype.hasOwnProperty.call(snapshot.stops, stop.stopId))
}

function selectStops(snapshot: PublicBusArrivalSnapshot, stops: readonly PublicBusArrivalStopRequest[]): PublicBusArrivalSnapshot {
  return {
    ...snapshot,
    stops: Object.fromEntries(stops.map((stop) => [stop.stopId, snapshot.stops[stop.stopId] ?? {
      observedAt: snapshot.observedAt,
      expiresAt: snapshot.expiresAt,
      services: {},
    }])),
  }
}

function mergeSnapshot(current: PublicBusArrivalSnapshot | null, incoming: PublicBusArrivalSnapshot): PublicBusArrivalSnapshot {
  if (!current || isOlderPublicBusArrivalSnapshot(incoming, current)) return current ?? incoming
  return { ...incoming, stops: { ...current.stops, ...incoming.stops } }
}

export function createPublicBusArrivalClient(
  options: PublicBusArrivalClientOptions = {},
): PublicBusArrivalClient {
  const endpoint = options.endpoint ?? buildApiUrl('/api/public-bus-arrivals', options.apiOrigin)
  const cacheTtlMs = options.cacheTtlMs ?? PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  let cached: { readonly snapshot: PublicBusArrivalSnapshot; readonly cacheExpiresAt: number } | null = null
  let inFlight: Promise<void> | null = null

  const readSnapshot = async (stops: readonly PublicBusArrivalStopRequest[], signal: AbortSignal): Promise<void> => {
    if (inFlight) {
      await inFlight
      if (cached && cached.cacheExpiresAt > now() && hasStops(cached.snapshot, stops)) return
    }
    const request = fetcher(
      `${endpoint}?stops=${encodeURIComponent(JSON.stringify(stops))}`,
      { signal },
    ).then(async (response) => {
      if (!response.ok) throw new Error(`Public bus arrival request failed: ${response.status}`)
      const snapshot = parseSnapshot(await response.json() as unknown)
      if (Date.parse(snapshot.expiresAt) <= now()) throw new Error('Public bus arrival response has expired')
      const merged = mergeSnapshot(cached?.snapshot ?? null, snapshot)
      cached = {
        snapshot: merged,
        cacheExpiresAt: Math.min(Date.parse(merged.expiresAt), now() + cacheTtlMs),
      }
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') throw error
      throw new PublicBusArrivalFetchError('Live public bus arrival data could not be fetched', { cause: error })
    })
    inFlight = request
    try {
      await request
    } finally {
      if (inFlight === request) inFlight = null
    }
  }

  return {
    async getArrivals(stops, signal) {
      const uniqueStops = [...new Map(stops.map((stop) => [stop.stopId, stop])).values()]
      if (uniqueStops.length === 0) throw new PublicBusArrivalFetchError('At least one public bus stop is required')
      if (!cached || cached.cacheExpiresAt <= now() || !hasStops(cached.snapshot, uniqueStops)) {
        await readSnapshot(uniqueStops, signal)
      }
      if (!cached || cached.cacheExpiresAt <= now() || !hasStops(cached.snapshot, uniqueStops)) {
        throw new PublicBusArrivalFetchError('Live public bus arrival data did not include the requested stops')
      }
      return selectStops(cached.snapshot, uniqueStops)
    },
  }
}

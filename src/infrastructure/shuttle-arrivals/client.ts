import type {
  ShuttleArrivalObservation,
  ShuttleArrivalSnapshot,
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
} from '../../domain/transit/arrivals'

export interface ShuttleArrivalStopRequest {
  readonly stopId: string
  readonly stopName: string
}

export class ShuttleArrivalFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ShuttleArrivalFetchError'
  }
}

export interface ShuttleArrivalClient {
  getArrivals(
    stops: readonly ShuttleArrivalStopRequest[],
    signal: AbortSignal,
  ): Promise<ShuttleArrivalSnapshot>
}

interface CachedStop {
  readonly observedAt: string
  readonly expiresAt: string
  readonly cacheExpiresAt: string
  readonly routes: ShuttleArrivalSnapshot['stops'][string]
}

interface ShuttleArrivalClientOptions {
  readonly endpoint?: string
  readonly cacheTtlMs?: number
  readonly now?: () => number
  readonly fetcher?: typeof fetch
}

const DEFAULT_CACHE_TTL_MS = 45_000
const MAX_STOPS_PER_REQUEST = 16

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Shuttle arrival response has an invalid ${label}`)
  }
  return value
}

function normalizeHeadway(
  value: unknown,
  arrivals: readonly number[],
): ShuttleHeadwaySeconds | null {
  if (arrivals.length < 2 || !isRecord(value)) return null
  const min = value.min
  const max = value.max
  const median = value.median
  if (
    typeof min !== 'number' || !Number.isFinite(min) || min <= 0 ||
    typeof max !== 'number' || !Number.isFinite(max) || max < min ||
    typeof median !== 'number' || !Number.isFinite(median) || median < min || median > max
  ) return null
  const hasPositiveGap = arrivals.some((arrival, index) => index > 0 && arrival > arrivals[index - 1])
  return hasPositiveGap ? { min, max, median } : null
}

function normalizeRouteData(value: unknown): ShuttleRouteArrivalData | null {
  if (!isRecord(value)) return null
  const nextArrival = value.nextArrivalSeconds
  const upcoming = Array.isArray(value.upcomingArrivalSeconds)
    ? value.upcomingArrivalSeconds
      .filter((arrival): arrival is number => typeof arrival === 'number' && Number.isFinite(arrival) && arrival >= 0)
    : []
  const arrivals = [
    ...(typeof nextArrival === 'number' && Number.isFinite(nextArrival) && nextArrival >= 0 ? [nextArrival] : []),
    ...upcoming,
  ].filter((arrival, index, values) => values.indexOf(arrival) === index).sort((first, second) => first - second)
  if (arrivals.length === 0) return null
  return {
    nextArrivalSeconds: arrivals[0],
    upcomingArrivalSeconds: arrivals,
    headwaySeconds: normalizeHeadway(value.headwaySeconds, arrivals),
  }
}

function parseSnapshot(input: unknown): ShuttleArrivalSnapshot {
  if (!isRecord(input) || !isRecord(input.stops)) {
    throw new Error('Shuttle arrival response was invalid')
  }
  const observedAt = parseTimestamp(input.observedAt, 'observedAt')
  const expiresAt = parseTimestamp(input.expiresAt, 'expiresAt')
  if (Date.parse(expiresAt) <= Date.parse(observedAt)) {
    throw new Error('Shuttle arrival response has an invalid expiry range')
  }

  const stops: Record<string, ShuttleArrivalSnapshot['stops'][string]> = {}
  for (const [stopId, routeValue] of Object.entries(input.stops)) {
    if (!isRecord(routeValue)) continue
    const routes: Record<string, ShuttleArrivalSnapshot['stops'][string][string]> = {}
    for (const [routeId, arrival] of Object.entries(routeValue)) {
      const normalized = normalizeRouteData(arrival)
      if (normalized) routes[routeId] = normalized
    }
    stops[stopId] = routes
  }
  return { observedAt, expiresAt, stops }
}

function requestKey(stop: ShuttleArrivalStopRequest): string {
  return `${stop.stopId}\u0000${stop.stopName}`
}

function createCachedStop(
  stop: ShuttleArrivalStopRequest,
  snapshot: ShuttleArrivalSnapshot,
  now: () => number,
  cacheTtlMs: number,
): CachedStop {
  const providerExpiryMs = Date.parse(snapshot.expiresAt)
  const cacheExpiryMs = now() + cacheTtlMs
  return {
    observedAt: snapshot.observedAt,
    expiresAt: snapshot.expiresAt,
    cacheExpiresAt: new Date(Math.min(providerExpiryMs, cacheExpiryMs)).toISOString(),
    routes: snapshot.stops[stop.stopId] ?? {},
  }
}

export function createShuttleArrivalClient(
  options: ShuttleArrivalClientOptions = {},
): ShuttleArrivalClient {
  const endpoint = options.endpoint ?? `${import.meta.env.BASE_URL}api/shuttle-arrivals`
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  const cache = new Map<string, CachedStop>()
  const inFlight = new Map<string, Promise<CachedStop | null>>()

  const loadStops = async (
    stops: readonly ShuttleArrivalStopRequest[],
    signal: AbortSignal,
  ): Promise<readonly (CachedStop | null)[]> => {
    const requests = new Map<string, Promise<CachedStop | null>>()
    const uncachedStops: ShuttleArrivalStopRequest[] = []

    for (const stop of stops) {
      const key = requestKey(stop)
      const cached = cache.get(key)
      if (cached && Date.parse(cached.cacheExpiresAt) > now()) {
        requests.set(key, Promise.resolve(cached))
        continue
      }
      const existing = inFlight.get(key)
      if (existing) {
        requests.set(key, existing)
        continue
      }
      uncachedStops.push(stop)
    }

    for (let index = 0; index < uncachedStops.length; index += MAX_STOPS_PER_REQUEST) {
      const batch = uncachedStops.slice(index, index + MAX_STOPS_PER_REQUEST)
      const batchRequest = fetcher(
        `${endpoint}?stops=${encodeURIComponent(JSON.stringify(batch))}`,
        { signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Shuttle arrival request failed: ${response.status}`)
          const snapshot = parseSnapshot(await response.json() as unknown)
          if (Date.parse(snapshot.expiresAt) <= now()) {
            throw new Error('Shuttle arrival response has expired')
          }
          return snapshot
        })
        .then((snapshot) => new Map(
          batch.map((stop) => [
            requestKey(stop),
            createCachedStop(stop, snapshot, now, cacheTtlMs),
          ] as const),
        ))

      for (const stop of batch) {
        const key = requestKey(stop)
        const trackedRequest = batchRequest
          .then((entries) => {
            const entry = entries.get(key) ?? null
            if (entry) cache.set(key, entry)
            return entry
          })
          .catch((error: unknown) => {
            if (error instanceof Error && error.name === 'AbortError') throw error
            throw new ShuttleArrivalFetchError('Live shuttle arrival data could not be fetched', {
              cause: error,
            })
          })
          .finally(() => {
            inFlight.delete(key)
          })
        inFlight.set(key, trackedRequest)
        requests.set(key, trackedRequest)
      }
    }

    return Promise.all(stops.map((stop) => requests.get(requestKey(stop))!))
  }

  return {
    async getArrivals(stops, signal) {
      const uniqueStops = [...new Map(stops.map((stop) => [requestKey(stop), stop])).values()]
      const entries = await loadStops(uniqueStops, signal)
      const validEntries = entries.filter((entry): entry is CachedStop => entry !== null)
      const observedAt = validEntries
        .map((entry) => entry.observedAt)
        .sort()[0]
      if (!observedAt) throw new ShuttleArrivalFetchError('Live shuttle arrival data could not be fetched')
      const expiresAt = validEntries
        .map((entry) => entry.expiresAt)
        .sort()[0]
      const result: Record<string, ShuttleArrivalSnapshot['stops'][string]> = {}
      uniqueStops.forEach((stop, index) => {
        const entry = entries[index]
        if (entry) result[stop.stopId] = entry.routes
      })
      const stopObservations: Record<string, ShuttleArrivalObservation> = {}
      uniqueStops.forEach((stop, index) => {
        const entry = entries[index]
        if (entry) {
          stopObservations[stop.stopId] = {
            observedAt: entry.observedAt,
            expiresAt: entry.expiresAt,
          }
        }
      })
      return { observedAt, expiresAt, stops: result, stopObservations }
    },
  }
}

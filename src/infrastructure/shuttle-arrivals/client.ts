import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'

export interface ShuttleArrivalStopRequest {
  readonly stopId: string
  readonly stopName: string
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
  readonly routes: ShuttleArrivalSnapshot['stops'][string]
}

interface ShuttleArrivalClientOptions {
  readonly endpoint?: string
  readonly cacheTtlMs?: number
  readonly staleTtlMs?: number
  readonly now?: () => number
  readonly fetcher?: typeof fetch
}

const DEFAULT_CACHE_TTL_MS = 45_000
const DEFAULT_STALE_TTL_MS = 120_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidRouteData(value: unknown): value is ShuttleArrivalSnapshot['stops'][string][string] {
  if (!isRecord(value)) return false
  const upcoming = value.upcomingArrivalSeconds
  const headway = value.headwaySeconds
  const validHeadway = headway === null || (
    isRecord(headway) &&
    typeof headway.min === 'number' && Number.isFinite(headway.min) && headway.min > 0 &&
    typeof headway.max === 'number' && Number.isFinite(headway.max) && headway.max >= headway.min &&
    typeof headway.median === 'number' && Number.isFinite(headway.median) && headway.median >= headway.min && headway.median <= headway.max
  )
  return typeof value.nextArrivalSeconds === 'number' &&
    Number.isFinite(value.nextArrivalSeconds) &&
    value.nextArrivalSeconds >= 0 &&
    Array.isArray(upcoming) &&
    upcoming.every((arrival) => typeof arrival === 'number' && Number.isFinite(arrival) && arrival >= 0) &&
    validHeadway
}

function parseSnapshot(input: unknown): ShuttleArrivalSnapshot {
  if (!isRecord(input) || typeof input.observedAt !== 'string' || typeof input.expiresAt !== 'string' || !isRecord(input.stops)) {
    throw new Error('Shuttle arrival response was invalid')
  }

  const stops: Record<string, ShuttleArrivalSnapshot['stops'][string]> = {}
  for (const [stopId, routeValue] of Object.entries(input.stops)) {
    if (!isRecord(routeValue)) continue
    const routes: Record<string, ShuttleArrivalSnapshot['stops'][string][string]> = {}
    for (const [routeId, arrival] of Object.entries(routeValue)) {
      if (isValidRouteData(arrival)) routes[routeId] = arrival
    }
    stops[stopId] = routes
  }
  return { observedAt: input.observedAt, expiresAt: input.expiresAt, stops }
}

function requestKey(stop: ShuttleArrivalStopRequest): string {
  return `${stop.stopId}\u0000${stop.stopName}`
}

export function createShuttleArrivalClient(
  options: ShuttleArrivalClientOptions = {},
): ShuttleArrivalClient {
  const endpoint = options.endpoint ?? `${import.meta.env.BASE_URL}api/shuttle-arrivals`
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  const cache = new Map<string, CachedStop>()
  const inFlight = new Map<string, Promise<CachedStop | null>>()

  const loadStop = async (
    stop: ShuttleArrivalStopRequest,
    signal: AbortSignal,
  ): Promise<CachedStop | null> => {
    const key = requestKey(stop)
    const cached = cache.get(key)
    if (cached && Date.parse(cached.expiresAt) > now()) return cached

    const existing = inFlight.get(key)
    if (existing) return existing

    const request = fetcher(`${endpoint}?stops=${encodeURIComponent(JSON.stringify([stop]))}`, { signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Shuttle arrival request failed: ${response.status}`)
        return parseSnapshot(await response.json() as unknown)
      })
      .then((snapshot) => {
        const entry: CachedStop = {
          observedAt: snapshot.observedAt,
          expiresAt: new Date(now() + cacheTtlMs).toISOString(),
          routes: snapshot.stops[stop.stopId] ?? {},
        }
        cache.set(key, entry)
        return entry
      })
      .catch((error: unknown) => {
        if (cached && Date.parse(cached.observedAt) + staleTtlMs > now()) return cached
        if (error instanceof Error && error.name === 'AbortError') throw error
        return null
      })
      .finally(() => {
        inFlight.delete(key)
      })
    inFlight.set(key, request)
    return request
  }

  return {
    async getArrivals(stops, signal) {
      const uniqueStops = [...new Map(stops.map((stop) => [requestKey(stop), stop])).values()]
      const entries = await Promise.all(uniqueStops.map((stop) => loadStop(stop, signal)))
      const validEntries = entries.filter((entry): entry is CachedStop => entry !== null)
      const observedAt = validEntries
        .map((entry) => entry.observedAt)
        .sort()[0]
      if (!observedAt) throw new Error('No shuttle arrival data is available')
      const expiresAt = validEntries
        .map((entry) => entry.expiresAt)
        .sort()[0]
      const result: Record<string, ShuttleArrivalSnapshot['stops'][string]> = {}
      uniqueStops.forEach((stop, index) => {
        const entry = entries[index]
        if (entry) result[stop.stopId] = entry.routes
      })
      return { observedAt, expiresAt, stops: result }
    },
  }
}

import type {
  ShuttleArrivalSnapshot,
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
} from '../../domain/transit/arrivals'

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
  readonly now?: () => number
  readonly fetcher?: typeof fetch
}

const DEFAULT_CACHE_TTL_MS = 45_000

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

export function createShuttleArrivalClient(
  options: ShuttleArrivalClientOptions = {},
): ShuttleArrivalClient {
  const endpoint = options.endpoint ?? `${import.meta.env.BASE_URL}api/shuttle-arrivals`
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
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

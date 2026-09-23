import type {
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
} from '../../domain/transit/arrivals.js'

export interface ParsedShuttleServiceRoute {
  readonly routeId: string
  readonly arrival: ShuttleRouteArrivalData
}

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function getValue(record: RecordValue, keys: readonly string[]): unknown {
  const values = new Map(Object.entries(record).map(([key, value]) => [normalizeKey(key), value]))
  for (const key of keys) {
    const value = values.get(normalizeKey(key))
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function getTextValue(record: RecordValue, keys: readonly string[]): string | null {
  const normalizedKeys = new Set(keys.map(normalizeKey))
  for (const [key, value] of Object.entries(record)) {
    if (!normalizedKeys.has(normalizeKey(key)) || typeof value !== 'string') continue
    if (value.trim()) return value.trim()
  }
  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.trim().match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function toNonNegativeSeconds(value: unknown, multiplier = 1): number | null {
  const number = toNumber(value)
  if (number === null || number < 0) return null
  return Math.round(number * multiplier)
}

function parseArrivalSeconds(record: RecordValue): number | null {
  const seconds = toNonNegativeSeconds(getValue(record, [
    'nextArrivalSeconds',
    'next_arrival_seconds',
    'arrivalSeconds',
    'arrival_seconds',
    'etaSeconds',
    'eta_s',
  ]))
  if (seconds !== null) return seconds

  return toNonNegativeSeconds(getValue(record, [
    'nextArrivalMinutes',
    'next_arrival_minutes',
    'arrivalMinutes',
    'arrival_minutes',
    'etaMinutes',
    'eta',
  ]), 60)
}

function parseUpcomingSeconds(record: RecordValue): readonly number[] {
  const value = getValue(record, [
    'upcomingArrivalSeconds',
    'upcoming_arrival_seconds',
    'upcomingArrivals',
    'upcoming_arrivals',
    'arrivals',
    '_etas',
  ])
  if (!Array.isArray(value)) return []

  return value
    .map((arrival) => {
      if (isRecord(arrival)) return parseArrivalSeconds(arrival)
      return toNonNegativeSeconds(arrival)
    })
    .filter((arrival): arrival is number => arrival !== null)
}

function createHeadwaySeconds(arrivals: readonly number[]): ShuttleHeadwaySeconds | null {
  if (arrivals.length < 2) return null
  const differences = arrivals
    .slice(1)
    .map((arrival, index) => arrival - arrivals[index])
    .filter((difference) => difference > 0)
    .sort((first, second) => first - second)
  if (differences.length === 0) return null
  const middle = Math.floor(differences.length / 2)
  const median = differences.length % 2 === 0
    ? (differences[middle - 1] + differences[middle]) / 2
    : differences[middle]
  return {
    min: differences[0],
    max: differences[differences.length - 1],
    median,
  }
}

function routeIdFrom(record: RecordValue, routeHint: string | null): string | null {
  const route = getTextValue(record, [
    'routeId',
    'route_id',
    'routeCode',
    'route_code',
    'route',
    'service',
    'serviceCode',
    'service_code',
    'busService',
    'bus_service',
    'name',
  ])
  return route ?? routeHint
}

function parseCandidate(
  record: RecordValue,
  routeHint: string | null,
): ParsedShuttleServiceRoute | null {
  const routeId = routeIdFrom(record, routeHint)
  const nextArrivalSeconds = parseArrivalSeconds(record)
  const upcoming = [
    ...(nextArrivalSeconds === null ? [] : [nextArrivalSeconds]),
    ...parseUpcomingSeconds(record),
  ]
    .filter((arrival, index, values) => values.indexOf(arrival) === index)
    .sort((first, second) => first - second)
  if (!routeId || upcoming.length === 0) return null
  return {
    routeId,
    arrival: {
      nextArrivalSeconds: upcoming[0],
      upcomingArrivalSeconds: upcoming,
      headwaySeconds: createHeadwaySeconds(upcoming),
    },
  }
}

function isLikelyRouteKey(key: string): boolean {
  return /^[A-Za-z]\d{0,2}$/.test(key.trim())
}

function collectRoutes(
  value: unknown,
  routeHint: string | null,
  output: ParsedShuttleServiceRoute[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRoutes(item, routeHint, output)
    return
  }
  if (!isRecord(value)) return

  const candidate = parseCandidate(value, routeHint)
  if (candidate) {
    output.push(candidate)
    return
  }

  for (const [key, child] of Object.entries(value)) {
    const childRouteHint = isLikelyRouteKey(key) ? key.trim() : routeHint
    if (child !== value) collectRoutes(child, childRouteHint, output)
  }
}

export function parseShuttleServiceResponse(input: unknown): readonly ParsedShuttleServiceRoute[] {
  const parsed: ParsedShuttleServiceRoute[] = []
  collectRoutes(input, null, parsed)
  const byRoute = new Map<string, ParsedShuttleServiceRoute>()
  for (const route of parsed) byRoute.set(route.routeId, route)
  return [...byRoute.values()]
}

import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals.js'
import type { ShuttleArrivalStop } from './snapshot.js'

export function parseRequestedStops(
  value: string | null,
  canonicalStops: readonly ShuttleArrivalStop[],
): readonly ShuttleArrivalStop[] {
  if (!value) throw new Error('The stops query is required')
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > canonicalStops.length) {
    throw new Error(`The stops query must contain between 1 and ${canonicalStops.length} stops`)
  }
  const canonicalById = new Map(canonicalStops.map((stop) => [stop.stopId, stop]))
  const seen = new Set<string>()
  const stops: ShuttleArrivalStop[] = []
  for (const item of parsed) {
    const stopId = typeof item === 'string'
      ? item
      : typeof item === 'object' && item !== null && !Array.isArray(item)
        ? (item as { stopId?: unknown }).stopId
        : undefined
    if (typeof stopId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(stopId)) {
      throw new Error('Each requested stop must have a valid ID')
    }
    const canonicalStop = canonicalById.get(stopId)
    if (!canonicalStop) throw new Error(`Unknown canonical shuttle stop: ${stopId}`)
    if (seen.has(stopId)) continue
    seen.add(stopId)
    stops.push(canonicalStop)
  }
  return stops
}

export function selectRequestedStops(
  snapshot: ShuttleArrivalSnapshot,
  stops: readonly ShuttleArrivalStop[],
): ShuttleArrivalSnapshot {
  return {
    ...snapshot,
    stops: Object.fromEntries(stops.map((stop) => [stop.stopId, snapshot.stops[stop.stopId] ?? {}])),
  }
}

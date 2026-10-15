import type { ShuttleArrivalStop } from './snapshot.ts'
import { parseRequestedStopIds } from './request-selection.ts'

export function parseRequestedStops(
  value: string | null,
  canonicalStops: readonly ShuttleArrivalStop[],
): readonly ShuttleArrivalStop[] {
  const stopIds = parseRequestedStopIds(value, {
    queryLabel: 'stops',
    itemLabel: 'requested stop',
    maxItems: canonicalStops.length,
  })
  const canonicalById = new Map(canonicalStops.map((stop) => [stop.stopId, stop]))
  return stopIds.map((stopId) => {
    const stop = canonicalById.get(stopId)
    if (!stop) throw new Error('Unknown canonical bus stop: ' + stopId)
    return stop
  })
}

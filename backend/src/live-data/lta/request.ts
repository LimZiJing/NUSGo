import type { LtaPublicBusStopMapping } from './mapping.ts'

export function parseRequestedLtaStops(
  stopIds: readonly string[],
  mappings: readonly LtaPublicBusStopMapping[],
): readonly LtaPublicBusStopMapping[] {
  const mappingById = new Map(mappings.map((mapping) => [mapping.stopId, mapping]))
  return [...new Set(stopIds)].map((stopId) => {
    const mapping = mappingById.get(stopId)
    if (!mapping) throw new Error('Unknown mapped public bus stop: ' + stopId)
    return mapping
  })
}

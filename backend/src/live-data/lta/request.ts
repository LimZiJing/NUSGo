import type { LtaPublicBusStopMapping } from './mapping.ts'
import { parseRequestedStopIds } from '../request-selection.ts'

export function parseRequestedLtaStops(
  value: string | null,
  mappings: readonly LtaPublicBusStopMapping[],
): readonly LtaPublicBusStopMapping[] {
  const stopIds = parseRequestedStopIds(value, {
    queryLabel: 'public bus stops',
    itemLabel: 'public bus stop',
    maxItems: mappings.length,
  })
  const mappingById = new Map(mappings.map((mapping) => [mapping.stopId, mapping]))
  return stopIds.map((stopId) => {
    const mapping = mappingById.get(stopId)
    if (!mapping) throw new Error('Unknown mapped public bus stop: ' + stopId)
    return mapping
  })
}

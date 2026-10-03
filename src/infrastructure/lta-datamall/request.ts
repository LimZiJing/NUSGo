import type { LtaPublicBusStopMapping } from './mapping'

export function parseRequestedLtaStops(
  value: string | null,
  mappings: readonly LtaPublicBusStopMapping[],
): readonly LtaPublicBusStopMapping[] {
  if (!value) throw new Error('The public bus stops query is required')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('The public bus stops query must be valid JSON')
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > mappings.length) {
    throw new Error(`The public bus stops query must contain between 1 and ${mappings.length} stops`)
  }

  const mappingById = new Map(mappings.map((mapping) => [mapping.stopId, mapping]))
  const seen = new Set<string>()
  const stops: LtaPublicBusStopMapping[] = []
  for (const item of parsed) {
    const stopId = typeof item === 'string'
      ? item
      : typeof item === 'object' && item !== null && !Array.isArray(item)
        ? (item as { stopId?: unknown }).stopId
        : undefined
    if (typeof stopId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(stopId)) {
      throw new Error('Each public bus stop must have a valid ID')
    }
    const mapping = mappingById.get(stopId)
    if (!mapping) throw new Error(`Unknown mapped public bus stop: ${stopId}`)
    if (seen.has(stopId)) continue
    seen.add(stopId)
    stops.push(mapping)
  }
  return stops
}

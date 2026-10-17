export class InvalidSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSelectionError'
  }
}

export interface StopSelectionOptions {
  readonly queryLabel: string
  readonly itemLabel: string
  readonly unknownStop: (stopId: string) => string
}

export function parseBusStopSelection(
  value: unknown,
  availableStopIds: readonly string[],
  options: StopSelectionOptions,
): readonly string[] {
  const query = typeof value === 'string' ? value : null
  if (!query) throw new InvalidSelectionError('The ' + options.queryLabel + ' query is required')

  let parsed: unknown
  try {
    parsed = JSON.parse(query)
  } catch {
    throw new InvalidSelectionError('The ' + options.queryLabel + ' query must be valid JSON')
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > availableStopIds.length) {
    throw new InvalidSelectionError(
      'The ' + options.queryLabel + ' query must contain between 1 and ' + availableStopIds.length + ' stops',
    )
  }

  const available = new Set(availableStopIds)
  const seen = new Set<string>()
  const stopIds: string[] = []
  for (const item of parsed) {
    const stopId = typeof item === 'string'
      ? item
      : typeof item === 'object' && item !== null && !Array.isArray(item)
        ? (item as { stopId?: unknown }).stopId
        : undefined
    if (typeof stopId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(stopId)) {
      throw new InvalidSelectionError('Each ' + options.itemLabel + ' must have a valid ID')
    }
    if (!available.has(stopId)) throw new InvalidSelectionError(options.unknownStop(stopId))
    if (seen.has(stopId)) continue
    seen.add(stopId)
    stopIds.push(stopId)
  }
  return stopIds
}

export function parseBusRouteSelection(
  value: unknown,
  canonicalRouteIds: readonly string[],
): readonly string[] {
  const query = typeof value === 'string' ? value : null
  if (!query) throw new InvalidSelectionError('The routes query is required')
  const routeIds = query.split(',').map((routeId) => routeId.trim())
  if (routeIds.length === 0 || routeIds.length > 16 || routeIds.some((routeId) => !/^[A-Za-z0-9_-]{1,40}$/.test(routeId))) {
    throw new InvalidSelectionError('The routes query must contain between 1 and 16 valid route IDs')
  }

  const canonical = new Set(canonicalRouteIds)
  const unique = [...new Set(routeIds)]
  for (const routeId of unique) {
    if (!canonical.has(routeId)) throw new InvalidSelectionError('Unknown canonical bus route: ' + routeId)
  }
  return unique
}

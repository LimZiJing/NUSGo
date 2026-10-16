export interface RequestedStopIdsOptions {
  readonly queryLabel: string
  readonly itemLabel: string
  readonly maxItems: number
}

export function parseRequestedStopIds(
  value: string | null,
  options: RequestedStopIdsOptions,
): readonly string[] {
  if (!value) throw new Error('The ' + options.queryLabel + ' query is required')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('The ' + options.queryLabel + ' query must be valid JSON')
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > options.maxItems) {
    throw new Error(
      'The ' + options.queryLabel + ' query must contain between 1 and ' + options.maxItems + ' stops',
    )
  }

  const seen = new Set<string>()
  const stopIds: string[] = []
  for (const item of parsed) {
    const stopId = typeof item === 'string'
      ? item
      : typeof item === 'object' && item !== null && !Array.isArray(item)
        ? (item as { stopId?: unknown }).stopId
        : undefined
    if (typeof stopId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(stopId)) {
      throw new Error('Each ' + options.itemLabel + ' must have a valid ID')
    }
    if (seen.has(stopId)) continue
    seen.add(stopId)
    stopIds.push(stopId)
  }
  return stopIds
}

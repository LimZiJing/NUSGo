import type { ShuttleArrivalStop } from './snapshot.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseCanonicalShuttleStops(input: unknown): readonly ShuttleArrivalStop[] {
  if (!isRecord(input) || !Array.isArray(input.stops)) {
    throw new Error('Canonical bus network does not contain a stops array')
  }

  const seen = new Set<string>()
  const stops: ShuttleArrivalStop[] = []
  for (const [index, value] of input.stops.entries()) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.longName !== 'string') {
      throw new Error(`Canonical bus stop at index ${index} is invalid`)
    }
    const stopId = value.id.trim()
    const stopName = value.longName.trim()
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(stopId) || stopName.length === 0 || stopName.length > 160) {
      throw new Error(`Canonical bus stop ${stopId || `<index ${index}>`} is invalid`)
    }
    if (seen.has(stopId)) throw new Error(`Duplicate canonical bus stop: ${stopId}`)
    seen.add(stopId)
    stops.push({ stopId, stopName })
  }

  if (stops.length !== 33) {
    throw new Error(`Expected 33 canonical bus stops, found ${stops.length}`)
  }
  return stops
}

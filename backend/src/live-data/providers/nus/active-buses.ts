import type { ShuttleLoadLevel } from '@nusgo/shared'

export interface ParsedNusActiveBus {
  readonly plate: string
  readonly lat: number
  readonly lng: number
  readonly headingDegrees: number
  readonly speed: number
  readonly load: ShuttleLoadLevel
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

function parsePlate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const plate = value.trim()
  return plate ? plate : null
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseInRange(value: unknown, min: number, max: number): number | null {
  const number = parseFiniteNumber(value)
  if (number === null || number < min || number > max) return null
  return number
}

// Only the crowd level NUS reports is used. Occupancy is never turned into a level.
function parseLoadLevel(loadInfo: unknown): ShuttleLoadLevel {
  if (!isRecord(loadInfo)) return 'unknown'
  const crowdLevel = getValue(loadInfo, ['crowdLevel'])
  if (typeof crowdLevel !== 'string') return 'unknown'
  const level = crowdLevel.trim().toLowerCase()
  if (level === 'low' || level === 'medium' || level === 'high') return level
  return 'unknown'
}

function parseActiveBus(value: unknown): ParsedNusActiveBus | null {
  if (!isRecord(value)) return null
  const plate = parsePlate(getValue(value, ['vehplate']))
  const lat = parseInRange(getValue(value, ['lat']), -90, 90)
  const lng = parseInRange(getValue(value, ['lng']), -180, 180)
  const headingDegrees = parseInRange(getValue(value, ['direction']), 0, 360)
  const speed = parseInRange(getValue(value, ['speed']), 0, Number.POSITIVE_INFINITY)
  if (plate === null || lat === null || lng === null || headingDegrees === null || speed === null) {
    return null
  }
  return {
    plate,
    lat,
    lng,
    headingDegrees,
    speed,
    load: parseLoadLevel(getValue(value, ['loadInfo'])),
  }
}

// Returns an empty list for any malformed payload. Individual bad buses are skipped, not fatal.
export function parseNusActiveBuses(payload: unknown): readonly ParsedNusActiveBus[] {
  if (!isRecord(payload)) return []
  const data = getValue(payload, ['data'])
  if (!isRecord(data)) return []
  const activeBuses = getValue(data, ['activebus'])
  if (!Array.isArray(activeBuses)) return []

  return activeBuses.flatMap((bus) => {
    const parsed = parseActiveBus(bus)
    return parsed ? [parsed] : []
  })
}

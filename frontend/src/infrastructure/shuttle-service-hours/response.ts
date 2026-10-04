import type { ShuttleServiceWindow } from '../../domain/transit/service-hours.js'

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: RecordValue, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseDates(value: unknown): readonly string[] {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((date) => date.trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
}

export function parseRouteServiceWindows(
  input: unknown,
  routeId: string,
): readonly ShuttleServiceWindow[] {
  if (!isRecord(input) || !isRecord(input.data)) {
    throw new Error('NUS route service-hour response was invalid')
  }
  const records = input.data.RouteMinMaxTime
  if (!Array.isArray(records)) {
    throw new Error('NUS route service-hour response was invalid')
  }
  return records.flatMap((value) => {
    if (!isRecord(value)) return []
    const firstTime = text(value, ['FirstTime', 'firstTime', 'first_time'])
    const lastTime = text(value, ['LastTime', 'lastTime', 'last_time'])
    const dayType = text(value, ['DayType', 'dayType', 'day_type'])
    if (!firstTime || !lastTime || !dayType) return []
    return [{
      routeId,
      firstTime,
      lastTime,
      dayType,
      dates: parseDates(value.Dates ?? value.dates),
    }]
  })
}

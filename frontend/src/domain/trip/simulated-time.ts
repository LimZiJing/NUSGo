const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000

export function parseSingaporeDateTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (year < 100 || month < 1 || month > 12 || hour > 23 || minute > 59) return null
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) return null
  return Date.UTC(year, month - 1, day, hour, minute) - SINGAPORE_OFFSET_MS
}

export function formatSingaporeDateTime(instantMs: number): string {
  return new Date(instantMs + SINGAPORE_OFFSET_MS).toISOString().slice(0, 16)
}

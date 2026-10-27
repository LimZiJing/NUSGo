export type MinuteFormat = 'm' | 'prime' | 'min'

export const DEFAULT_MINUTE_FORMAT: MinuteFormat = 'prime'

export function isMinuteFormat(value: unknown): value is MinuteFormat {
  return value === 'm' || value === 'prime' || value === 'min'
}

export function formatMinutes(minutes: number, minuteFormat: MinuteFormat = DEFAULT_MINUTE_FORMAT): string {
  const value = Math.max(0, Math.ceil(minutes))
  if (minuteFormat === 'm') return `${value}m`
  if (minuteFormat === 'min') return `${value} min`
  return `${value}′`
}

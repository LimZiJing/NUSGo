import { SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS } from '../../domain/transit/arrivals.js'

const MIN_REFRESH_INTERVAL_MS = 1_000

export function parseShuttleArrivalRefreshInterval(
  env: Record<string, string | undefined>,
): number {
  const raw = env.NUS_SHUTTLE_REFRESH_INTERVAL_MS?.trim()
  if (!raw) return SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS

  const value = Number(raw)
  if (!Number.isInteger(value) || value < MIN_REFRESH_INTERVAL_MS) {
    throw new Error(
      'NUS_SHUTTLE_REFRESH_INTERVAL_MS must be an integer of at least 1000 milliseconds',
    )
  }
  return value
}

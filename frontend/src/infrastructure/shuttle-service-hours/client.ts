import type { ShuttleServiceWindow } from '../../domain/transit/service-hours'

export interface ShuttleServiceHoursClient {
  getServiceWindows(
    routeIds: readonly string[],
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, readonly ShuttleServiceWindow[]>>>
}

interface ShuttleServiceHoursClientOptions {
  readonly endpoint?: string
  readonly fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWindow(value: unknown): value is ShuttleServiceWindow {
  return isRecord(value) &&
    typeof value.routeId === 'string' &&
    typeof value.firstTime === 'string' &&
    typeof value.lastTime === 'string' &&
    typeof value.dayType === 'string' &&
    Array.isArray(value.dates) &&
    value.dates.every((date) => typeof date === 'string')
}

function parseResponse(input: unknown): Readonly<Record<string, readonly ShuttleServiceWindow[]>> {
  if (!isRecord(input) || !isRecord(input.routes)) throw new Error('bus service-hour response was invalid')
  const routes: Record<string, readonly ShuttleServiceWindow[]> = {}
  for (const [routeId, value] of Object.entries(input.routes)) {
    if (!Array.isArray(value)) continue
    routes[routeId] = value.filter(isWindow)
  }
  return routes
}

export function createShuttleServiceHoursClient(
  options: ShuttleServiceHoursClientOptions = {},
): ShuttleServiceHoursClient {
  const endpoint = options.endpoint ?? `${import.meta.env.BASE_URL}api/shuttle-service-windows`
  const fetcher = options.fetcher ?? fetch
  return {
    async getServiceWindows(routeIds, signal) {
      const uniqueRouteIds = [...new Set(routeIds)]
      const response = await fetcher(`${endpoint}?routes=${encodeURIComponent(uniqueRouteIds.join(','))}`, { signal })
      if (!response.ok) throw new Error(`bus service-hour request failed: ${response.status}`)
      return parseResponse(await response.json() as unknown)
    },
  }
}

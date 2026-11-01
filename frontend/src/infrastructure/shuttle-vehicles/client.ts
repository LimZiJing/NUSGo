import { buildApiUrl } from '../api/api-url'
import { parseApiShuttleVehiclesResponse } from '@nusgo/shared'
import type { ShuttleVehicleClient } from '../../app/contracts/shuttle-vehicles'

export class ShuttleVehicleFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ShuttleVehicleFetchError'
  }
}

interface ShuttleVehicleClientOptions {
  readonly apiOrigin?: string
  readonly endpoint?: string
  readonly fetcher?: typeof fetch
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function createShuttleVehicleClient(
  options: ShuttleVehicleClientOptions = {},
): ShuttleVehicleClient {
  const endpoint = options.endpoint ?? buildApiUrl('/api/shuttle-vehicles', options.apiOrigin)
  const fetcher = options.fetcher ?? fetch

  return {
    async getVehicles(routeIds, signal) {
      const uniqueRouteIds = [...new Set(routeIds)]
      if (uniqueRouteIds.length === 0) {
        throw new ShuttleVehicleFetchError('At least one shuttle route is required')
      }

      try {
        const response = await fetcher(
          `${endpoint}?routes=${encodeURIComponent(uniqueRouteIds.join(','))}`,
          { signal },
        )
        if (!response.ok) throw new Error(`bus vehicle request failed: ${response.status}`)
        const payload = await response.json() as unknown
        const vehicles = parseApiShuttleVehiclesResponse(payload)
        if (!vehicles) throw new Error('bus vehicle response was invalid')
        return vehicles
      } catch (error: unknown) {
        if (isAbortError(error)) throw error
        throw new ShuttleVehicleFetchError('Live bus vehicle data could not be fetched', { cause: error })
      }
    },
  }
}

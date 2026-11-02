import { buildApiUrl } from '../api/api-url'
import { parseApiShuttleVehiclesResponse } from '@nusgo/shared'
import type { ShuttleVehicleClient } from '../../app/contracts/shuttle-vehicles'
import { ShuttleVehicleFetchError } from '../../domain/transit/shuttle-vehicle-error'
export { ShuttleVehicleFetchError } from '../../domain/transit/shuttle-vehicle-error'

interface ShuttleVehicleClientOptions {
  readonly apiOrigin?: string
  readonly endpoint?: string
  readonly fetcher?: typeof fetch
}

function isAbortError(error: unknown): boolean {
  return (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError'
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
        throw new ShuttleVehicleFetchError('At least one shuttle route is required', 'invalid-request')
      }

      try {
        const response = await fetcher(
          `${endpoint}?routes=${encodeURIComponent(uniqueRouteIds.join(','))}`,
          { signal },
        )
        if (!response.ok) throw new ShuttleVehicleFetchError('Live bus request failed', 'http', response.status)
        const payload: unknown = await response.json().catch((error: unknown) => {
          if (isAbortError(error)) throw error
          throw new ShuttleVehicleFetchError('Live bus response was invalid', 'invalid-response')
        })
        const vehicles = parseApiShuttleVehiclesResponse(payload)
        if (!vehicles) throw new ShuttleVehicleFetchError('Live bus response was invalid', 'invalid-response')
        return vehicles
      } catch (error: unknown) {
        if (isAbortError(error)) throw error
        if (error instanceof ShuttleVehicleFetchError) throw error
        throw new ShuttleVehicleFetchError('Live bus vehicle data could not be fetched', 'network', undefined, { cause: error })
      }
    },
  }
}

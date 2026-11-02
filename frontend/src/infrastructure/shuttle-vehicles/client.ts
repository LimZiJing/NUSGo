import { buildApiUrl } from '../api/api-url'
import { parseApiShuttleVehiclesResponse } from '@nusgo/shared'
import type { ShuttleVehicleClient } from '../../app/contracts/shuttle-vehicles'
import { ShuttleVehicleFetchError } from '../../domain/transit/shuttle-vehicle-error'
export { ShuttleVehicleFetchError } from '../../domain/transit/shuttle-vehicle-error'

const SHUTTLE_VEHICLE_REQUEST_TIMEOUT_MS = 15_000

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

      const requestController = new AbortController()
      let timedOut = false
      const abortFromCaller = (): void => requestController.abort()
      if (signal.aborted) abortFromCaller()
      else signal.addEventListener('abort', abortFromCaller, { once: true })
      const timeoutId = setTimeout(() => {
        timedOut = true
        requestController.abort()
      }, SHUTTLE_VEHICLE_REQUEST_TIMEOUT_MS)

      try {
        const response = await fetcher(
          `${endpoint}?routes=${encodeURIComponent(uniqueRouteIds.join(','))}`,
          { signal: requestController.signal },
        )
        if (signal.aborted) throw new DOMException('The live bus request was cancelled', 'AbortError')
        if (timedOut) throw new DOMException('The live bus request timed out', 'AbortError')
        if (!response.ok) throw new ShuttleVehicleFetchError('Live bus request failed', 'http', response.status)
        const payload: unknown = await response.json().catch((error: unknown) => {
          if (isAbortError(error) || signal.aborted || timedOut) throw error
          throw new ShuttleVehicleFetchError('Live bus response was invalid', 'invalid-response')
        })
        if (signal.aborted) throw new DOMException('The live bus request was cancelled', 'AbortError')
        if (timedOut) throw new DOMException('The live bus request timed out', 'AbortError')
        const vehicles = parseApiShuttleVehiclesResponse(payload)
        if (!vehicles) throw new ShuttleVehicleFetchError('Live bus response was invalid', 'invalid-response')
        return vehicles
      } catch (error: unknown) {
        if (signal.aborted) throw error
        if (timedOut) {
          throw new ShuttleVehicleFetchError('Live bus vehicle request timed out', 'network', undefined, { cause: error })
        }
        if (isAbortError(error)) throw error
        if (error instanceof ShuttleVehicleFetchError) throw error
        throw new ShuttleVehicleFetchError('Live bus vehicle data could not be fetched', 'network', undefined, { cause: error })
      } finally {
        clearTimeout(timeoutId)
        signal.removeEventListener('abort', abortFromCaller)
      }
    },
  }
}

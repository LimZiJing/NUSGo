import type { ApiShuttleVehiclesResponse } from '@nusgo/shared'

export interface ShuttleVehicleClient {
  getVehicles(routeIds: readonly string[], signal: AbortSignal): Promise<ApiShuttleVehiclesResponse>
}

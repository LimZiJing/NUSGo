import { validateTransitNetwork } from './model.ts'
import { validateBusRouteGeometry } from './geometry.ts'
import type { TransitNetwork, BusRouteGeometry } from './types.ts'

export interface ValidatedTransitMapData {
  network: TransitNetwork
  geometry: BusRouteGeometry
}

export function validateTransitMapData(
  networkInput: unknown,
  geometryInput: unknown,
): ValidatedTransitMapData {
  const network = validateTransitNetwork(networkInput)
  const geometry = validateBusRouteGeometry(network, geometryInput)
  return { network, geometry }
}

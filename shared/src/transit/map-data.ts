import { validateTransitNetwork } from './model.ts'
import { validateTransitRouteGeometry } from './geometry.ts'
import type { TransitNetwork, TransitRouteGeometry } from './types.ts'

export interface ValidatedTransitMapData {
  network: TransitNetwork
  geometry: TransitRouteGeometry
}

export function validateTransitMapData(
  networkInput: unknown,
  geometryInput: unknown,
): ValidatedTransitMapData {
  const network = validateTransitNetwork(networkInput)
  const geometry = validateTransitRouteGeometry(network, geometryInput)
  return { network, geometry }
}

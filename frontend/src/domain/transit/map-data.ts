import { validateTransitNetwork } from './model'
import { validateTransitRouteGeometry } from './geometry'
import type { TransitNetwork, TransitRouteGeometry } from './types'

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

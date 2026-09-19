import { validateTransitRouteGeometry } from './geometry'
import { validateTransitNetwork } from './validation'
import type { TransitNetwork, TransitRouteGeometry } from './types'

export interface ValidatedTransitMapData {
  readonly network: TransitNetwork
  readonly geometry: TransitRouteGeometry
}

export function validateTransitMapData(
  networkInput: unknown,
  geometryInput: unknown,
): ValidatedTransitMapData {
  const network = validateTransitNetwork(networkInput)
  const geometry = validateTransitRouteGeometry(network, geometryInput)
  return { network, geometry }
}

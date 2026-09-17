import type { Map, Marker } from 'maplibre-gl'
import { addBusStopMarkers } from '../map/markers'
import { validateTransitNetwork } from './model'
import type { TransitNetwork } from '../types/transit'

export interface ValidatedTransitMarkers {
  network: TransitNetwork
  markers: Marker[]
}

export function addValidatedBusStopMarkers(
  map: Map,
  input: unknown,
): ValidatedTransitMarkers {
  const network = validateTransitNetwork(input)
  return {
    network,
    markers: addBusStopMarkers(map, network.stops),
  }
}

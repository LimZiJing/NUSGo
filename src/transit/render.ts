import type { LineLayerSpecification, Map, Marker } from 'maplibre-gl'
import { addBusStopMarkers } from '../map/markers'
import { validateTransitNetwork } from './model'
import { validateTransitRouteGeometry } from './geometry'
import type {
  TransitNetwork,
  TransitRouteGeometry,
} from '../types/transit'

export const TRANSIT_ROUTE_SOURCE_ID = 'shuttle-route-geometry'
export const TRANSIT_ROUTE_LAYER_ID = 'shuttle-route-lines'

const TRANSIT_ROUTE_LAYER: LineLayerSpecification = {
  id: TRANSIT_ROUTE_LAYER_ID,
  type: 'line',
  source: TRANSIT_ROUTE_SOURCE_ID,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': ['get', 'color'],
    'line-opacity': 0.85,
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 2,
      15, 4,
      18, 6,
    ],
  },
}

export function waitForMapStyleLoaded(
  map: Map,
  signal: AbortSignal,
): Promise<void> {
  if (map.isStyleLoaded()) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      map.off('load', handleLoad)
      signal.removeEventListener('abort', handleAbort)
    }
    const handleLoad = () => {
      cleanup()
      resolve()
    }
    const handleAbort = () => {
      cleanup()
      reject(new DOMException('The map style load was aborted', 'AbortError'))
    }

    map.once('load', handleLoad)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export interface ValidatedTransitMarkers {
  network: TransitNetwork
  markers: Marker[]
}

export interface ValidatedTransitMapData extends ValidatedTransitMarkers {
  geometry: TransitRouteGeometry
}

export function validateTransitMapData(
  networkInput: unknown,
  geometryInput: unknown,
): { network: TransitNetwork; geometry: TransitRouteGeometry } {
  const network = validateTransitNetwork(networkInput)
  const geometry = validateTransitRouteGeometry(network, geometryInput)
  return { network, geometry }
}

export function addTransitRouteLayers(
  map: Map,
  geometry: TransitRouteGeometry,
): void {
  if (!map.getSource(TRANSIT_ROUTE_SOURCE_ID)) {
    map.addSource(TRANSIT_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: geometry,
    })
  }

  if (!map.getLayer(TRANSIT_ROUTE_LAYER_ID)) {
    map.addLayer(TRANSIT_ROUTE_LAYER)
  }
}

export function removeTransitRouteLayers(map: Map): void {
  if (map.getLayer(TRANSIT_ROUTE_LAYER_ID)) {
    map.removeLayer(TRANSIT_ROUTE_LAYER_ID)
  }
  if (map.getSource(TRANSIT_ROUTE_SOURCE_ID)) {
    map.removeSource(TRANSIT_ROUTE_SOURCE_ID)
  }
}

const BASE_ROUTE_LINE_WIDTH: NonNullable<LineLayerSpecification['paint']>['line-width'] = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12, 2,
  15, 4,
  18, 6,
]

export function setTransitRouteSelection(
  map: Map,
  routeId: string | null,
): void {
  if (!map.getLayer(TRANSIT_ROUTE_LAYER_ID)) return

  if (routeId === null) {
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-opacity', 0.85)
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-width', BASE_ROUTE_LINE_WIDTH)
    return
  }

  const routeMatch: ['==', ['get', string], string] = ['==', ['get', 'routeId'], routeId]
  map.setPaintProperty(
    TRANSIT_ROUTE_LAYER_ID,
    'line-opacity',
    ['case', routeMatch, 1, 0.18],
  )
  map.setPaintProperty(
    TRANSIT_ROUTE_LAYER_ID,
    'line-width',
    [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, ['case', routeMatch, 3, 1.5],
      15, ['case', routeMatch, 6, 3],
      18, ['case', routeMatch, 8, 4.5],
    ],
  )
}

export function setBusStopMarkerSelection(
  markers: readonly Marker[],
  selectedStopIds: readonly string[] | null,
): void {
  const selectedIds = new Set(selectedStopIds ?? [])
  for (const marker of markers) {
    const element = marker.getElement()
    element.classList.toggle(
      'bus-stop-marker-selected',
      selectedIds.has(element.dataset.stopId ?? ''),
    )
  }
}

export function addValidatedTransitMapData(
  map: Map,
  networkInput: unknown,
  geometryInput: unknown,
): ValidatedTransitMapData {
  const { network, geometry } = validateTransitMapData(networkInput, geometryInput)
  addTransitRouteLayers(map, geometry)
  return {
    network,
    geometry,
    markers: addBusStopMarkers(map, network.stops),
  }
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

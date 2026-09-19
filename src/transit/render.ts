import type {
  FilterSpecification,
  LineLayerSpecification,
  Map,
  Marker,
  PaddingOptions,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import { addBusStopMarkers } from '../map/markers'
import { validateTransitNetwork } from './model'
import { validateTransitRouteGeometry } from './geometry'
import type {
  TransitNetwork,
  TransitGeoJsonPosition,
  TransitRouteGeometry,
} from '../types/transit'

export const TRANSIT_ROUTE_SOURCE_ID = 'shuttle-route-geometry'
export const TRANSIT_ROUTE_CASING_LAYER_ID = 'shuttle-route-casing'
export const TRANSIT_ROUTE_LAYER_ID = 'shuttle-route-lines'
export const TRANSIT_ROUTE_DIRECTION_LAYER_ID = 'shuttle-route-directions'

const BASE_ROUTE_LINE_COLOR = '#64748b'

const NO_ROUTE_FILTER: FilterSpecification = ['==', ['get', 'routeId'], '']

const BASE_ROUTE_CASING_WIDTH: NonNullable<LineLayerSpecification['paint']>['line-width'] = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12, 4,
  15, 6,
  18, 8,
]

const TRANSIT_ROUTE_CASING_LAYER: LineLayerSpecification = {
  id: TRANSIT_ROUTE_CASING_LAYER_ID,
  type: 'line',
  source: TRANSIT_ROUTE_SOURCE_ID,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#ffffff',
    'line-opacity': 0.35,
    'line-width': BASE_ROUTE_CASING_WIDTH,
  },
}

const TRANSIT_ROUTE_LAYER: LineLayerSpecification = {
  id: TRANSIT_ROUTE_LAYER_ID,
  type: 'line',
  source: TRANSIT_ROUTE_SOURCE_ID,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': BASE_ROUTE_LINE_COLOR,
    'line-opacity': 0.55,
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

const TRANSIT_ROUTE_DIRECTION_LAYER: SymbolLayerSpecification = {
  id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  type: 'symbol',
  source: TRANSIT_ROUTE_SOURCE_ID,
  filter: NO_ROUTE_FILTER,
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 80,
    'text-field': '▶',
    'text-font': ['Open Sans Regular'],
    'text-size': 12,
    'text-pitch-alignment': 'map',
    'text-rotation-alignment': 'map',
    'text-keep-upright': false,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-padding': 0,
  },
  paint: {
    'text-color': ['get', 'color'],
    'text-halo-color': '#ffffff',
    'text-halo-width': 1,
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

export type TransitRouteBounds = [[number, number], [number, number]]

export function getTransitRouteBounds(
  network: TransitNetwork,
  geometry: TransitRouteGeometry,
  routeId: string | null,
): TransitRouteBounds | null {
  const selectedRoute = routeId
    ? network.routes.find((route) => route.id === routeId) ?? null
    : null
  const selectedRouteIds = selectedRoute ? new Set([selectedRoute.id]) : null
  const positions: TransitGeoJsonPosition[] = geometry.features
    .filter(({ properties }) => selectedRouteIds === null || selectedRouteIds.has(properties.routeId))
    .flatMap(({ geometry: routeGeometry }) => routeGeometry.coordinates)
  const selectedStopIds = selectedRoute ? new Set(selectedRoute.stopIds) : null

  for (const stop of network.stops) {
    if (selectedStopIds === null || selectedStopIds.has(stop.id)) {
      positions.push([stop.longitude, stop.latitude])
    }
  }

  if (positions.length === 0) return null

  let west = positions[0][0]
  let south = positions[0][1]
  let east = positions[0][0]
  let north = positions[0][1]
  for (const [longitude, latitude] of positions.slice(1)) {
    west = Math.min(west, longitude)
    south = Math.min(south, latitude)
    east = Math.max(east, longitude)
    north = Math.max(north, latitude)
  }

  return [[west, south], [east, north]]
}

export function getTransitRouteFitPadding(viewportWidth: number): PaddingOptions {
  if (viewportWidth <= 600) {
    return { top: 280, right: 24, bottom: 64, left: 24 }
  }

  const sidePadding = Math.min(360, Math.max(24, Math.round(viewportWidth * 0.3)))
  return { top: 112, right: sidePadding, bottom: 64, left: sidePadding }
}

export function fitTransitRoute(
  map: Map,
  network: TransitNetwork,
  geometry: TransitRouteGeometry,
  routeId: string | null,
): void {
  const bounds = getTransitRouteBounds(network, geometry, routeId)
  if (!bounds) return

  map.fitBounds(bounds, {
    duration: 500,
    maxZoom: 16,
    padding: getTransitRouteFitPadding(map.getContainer().clientWidth),
  })
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

  if (!map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)) {
    map.addLayer(TRANSIT_ROUTE_CASING_LAYER)
  }
  if (!map.getLayer(TRANSIT_ROUTE_LAYER_ID)) {
    map.addLayer(TRANSIT_ROUTE_LAYER)
  }
  if (!map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)) {
    map.addLayer(TRANSIT_ROUTE_DIRECTION_LAYER)
  }
}

export function removeTransitRouteLayers(map: Map): void {
  if (map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)) {
    map.removeLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)
  }
  if (map.getLayer(TRANSIT_ROUTE_LAYER_ID)) {
    map.removeLayer(TRANSIT_ROUTE_LAYER_ID)
  }
  if (map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)) {
    map.removeLayer(TRANSIT_ROUTE_CASING_LAYER_ID)
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

type RouteMatchExpression = ['==', ['get', 'routeId'], string]

function createRouteOpacityExpression(
  routeMatch: RouteMatchExpression,
  overlappingRouteIds: ReadonlySet<string>,
  selectedOpacity: number,
  overlappingOpacity: number,
  unselectedOpacity: number,
): NonNullable<LineLayerSpecification['paint']>['line-opacity'] {
  if (overlappingRouteIds.size === 0) {
    return ['case', routeMatch, selectedOpacity, unselectedOpacity]
  }

  return [
    'case',
    routeMatch,
    selectedOpacity,
    [
      'case',
      ['in', ['get', 'routeId'], ['literal', Array.from(overlappingRouteIds)]],
      overlappingOpacity,
      unselectedOpacity,
    ],
  ]
}

export function setTransitRouteSelection(
  map: Map,
  routeId: string | null,
  overlappingRouteIds: ReadonlySet<string> = new Set(),
): void {
  if (!map.getLayer(TRANSIT_ROUTE_LAYER_ID)) return

  if (routeId === null) {
    if (map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)) {
      map.setPaintProperty(TRANSIT_ROUTE_CASING_LAYER_ID, 'line-opacity', 0.35)
      map.setPaintProperty(TRANSIT_ROUTE_CASING_LAYER_ID, 'line-width', BASE_ROUTE_CASING_WIDTH)
    }
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-color', BASE_ROUTE_LINE_COLOR)
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-opacity', 0.55)
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-width', BASE_ROUTE_LINE_WIDTH)
    if (map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)) {
      map.setFilter(TRANSIT_ROUTE_DIRECTION_LAYER_ID, NO_ROUTE_FILTER)
    }
    return
  }

  const routeMatch: RouteMatchExpression = ['==', ['get', 'routeId'], routeId]
  if (map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)) {
    map.setPaintProperty(
      TRANSIT_ROUTE_CASING_LAYER_ID,
      'line-opacity',
      createRouteOpacityExpression(routeMatch, overlappingRouteIds, 0.95, 0.04, 0.45),
    )
    map.setPaintProperty(
      TRANSIT_ROUTE_CASING_LAYER_ID,
      'line-width',
      [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, ['case', routeMatch, 7, 4],
        15, ['case', routeMatch, 9, 6],
        18, ['case', routeMatch, 11, 8],
      ],
    )
  }
  map.setPaintProperty(
    TRANSIT_ROUTE_LAYER_ID,
    'line-opacity',
    createRouteOpacityExpression(routeMatch, overlappingRouteIds, 1, 0.04, 0.18),
  )
  map.setPaintProperty(
    TRANSIT_ROUTE_LAYER_ID,
    'line-color',
    ['case', routeMatch, ['get', 'color'], BASE_ROUTE_LINE_COLOR],
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
  if (map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)) {
    map.setFilter(TRANSIT_ROUTE_DIRECTION_LAYER_ID, routeMatch)
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

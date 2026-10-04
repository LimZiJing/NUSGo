import type {
  FilterSpecification,
  LineLayerSpecification,
  Map,
  PaddingOptions,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { MapViewportInsets } from '../../app/contracts/map'
import type { TransitIndex } from '../../domain/transit'
import type {
  TransitGeoJsonPosition,
  TransitRouteGeometry,
} from '../../domain/transit/types'

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

export type TransitRouteBounds = [[number, number], [number, number]]

export function getTransitRouteBounds(
  index: TransitIndex,
  geometry: TransitRouteGeometry,
  routeId: string | null,
): TransitRouteBounds | null {
  const selectedRoute = routeId
    ? index.routeById.get(routeId) ?? null
    : null
  const selectedRouteIds = selectedRoute ? new Set([selectedRoute.id]) : null
  const positions: TransitGeoJsonPosition[] = geometry.features
    .filter(({ properties }) => selectedRouteIds === null || selectedRouteIds.has(properties.routeId))
    .flatMap(({ geometry: routeGeometry }) => routeGeometry.coordinates)
  const routeStops = selectedRoute ? index.routeStops(selectedRoute.id) : index.stops
  for (const stop of routeStops) {
    positions.push([stop.longitude, stop.latitude])
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

export function getTransitRouteFitPadding(
  viewportWidth: number,
  viewportInsets?: MapViewportInsets,
): PaddingOptions {
  if (viewportInsets && Object.values(viewportInsets).some((value) => value > 0)) {
    return {
      top: Math.max(24, viewportInsets.top),
      right: Math.max(24, viewportInsets.right),
      bottom: Math.max(64, viewportInsets.bottom),
      left: Math.max(24, viewportInsets.left),
    }
  }

  if (viewportWidth <= 768) {
    return { top: 280, right: 24, bottom: 64, left: 24 }
  }

  const sidePadding = Math.min(360, Math.max(24, Math.round(viewportWidth * 0.3)))
  return { top: 112, right: sidePadding, bottom: 64, left: sidePadding }
}

export interface TransitRouteLayers {
  setSelection(routeId: string | null, overlappingRouteIds?: ReadonlySet<string>): void
  setJourneyActive(active: boolean): void
  fitRoute(
    index: TransitIndex,
    geometry: TransitRouteGeometry,
    routeId: string | null,
    viewportInsets?: MapViewportInsets,
  ): void
  dispose(): void
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

function setTransitRouteSelection(
  map: Map,
  routeId: string | null,
  overlappingRouteIds: ReadonlySet<string>,
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

function setTransitRouteVisibility(map: Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none'
  for (const layerId of [
    TRANSIT_ROUTE_CASING_LAYER_ID,
    TRANSIT_ROUTE_LAYER_ID,
    TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
}

function fitTransitRoute(
  map: Map,
  index: TransitIndex,
  geometry: TransitRouteGeometry,
  routeId: string | null,
  viewportInsets?: MapViewportInsets,
): void {
  const bounds = getTransitRouteBounds(index, geometry, routeId)
  if (!bounds) return

  map.fitBounds(bounds, {
    duration: 500,
    maxZoom: 16,
    padding: getTransitRouteFitPadding(map.getContainer().clientWidth, viewportInsets),
  })
}

export function createTransitRouteLayers(
  map: Map,
  geometry: TransitRouteGeometry,
): TransitRouteLayers {
  const ownsSource = !map.getSource(TRANSIT_ROUTE_SOURCE_ID)
  const ownsCasingLayer = !map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)
  const ownsRouteLayer = !map.getLayer(TRANSIT_ROUTE_LAYER_ID)
  const ownsDirectionLayer = !map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)

  if (ownsSource) {
    map.addSource(TRANSIT_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: geometry,
    })
  }
  if (ownsCasingLayer) map.addLayer(TRANSIT_ROUTE_CASING_LAYER)
  if (ownsRouteLayer) map.addLayer(TRANSIT_ROUTE_LAYER)
  if (ownsDirectionLayer) map.addLayer(TRANSIT_ROUTE_DIRECTION_LAYER)

  let disposed = false
  let journeyActive = false
  let selectedRouteId: string | null = null
  let selectedOverlappingRouteIds: ReadonlySet<string> = new Set()
  return {
    setSelection(routeId, overlappingRouteIds = new Set()) {
      if (disposed) return
      selectedRouteId = routeId
      selectedOverlappingRouteIds = new Set(overlappingRouteIds)
      if (!journeyActive) {
        setTransitRouteSelection(map, selectedRouteId, selectedOverlappingRouteIds)
      }
    },
    setJourneyActive(active) {
      if (disposed || journeyActive === active) return
      journeyActive = active
      if (journeyActive) {
        setTransitRouteVisibility(map, false)
        return
      }

      setTransitRouteSelection(map, selectedRouteId, selectedOverlappingRouteIds)
      setTransitRouteVisibility(map, true)
    },
    fitRoute(index, routeGeometry, routeId, viewportInsets) {
      if (disposed) return
      fitTransitRoute(map, index, routeGeometry, routeId, viewportInsets)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (ownsDirectionLayer && map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)) {
        map.removeLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)
      }
      if (ownsRouteLayer && map.getLayer(TRANSIT_ROUTE_LAYER_ID)) {
        map.removeLayer(TRANSIT_ROUTE_LAYER_ID)
      }
      if (ownsCasingLayer && map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)) {
        map.removeLayer(TRANSIT_ROUTE_CASING_LAYER_ID)
      }
      if (ownsSource && map.getSource(TRANSIT_ROUTE_SOURCE_ID)) {
        map.removeSource(TRANSIT_ROUTE_SOURCE_ID)
      }
    },
  }
}

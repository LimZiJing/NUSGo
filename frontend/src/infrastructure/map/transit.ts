import type {
  FilterSpecification,
  LineLayerSpecification,
  Map,
  PaddingOptions,
} from 'maplibre-gl'
import type { MapViewportInsets } from '../../app/contracts/map'
import type { TransitIndex } from '../../domain/transit'
import { isMobileLayoutWidth } from '../../domain/layout-breakpoint'
import type {
  TransitGeoJsonPosition,
  BusRouteGeometry,
} from '@navus/shared/transit/types'
import {
  SELECTED_ROUTE_LANE_STOPS,
  DIRECTION_IMAGE_PIXEL_RATIO,
  createDirectionChevronImage,
  type LineWidthSpecification,
} from './route-lanes'

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

const BASE_ROUTE_CASING_WIDTH_BY_ZOOM = { 12: 4, 15: 6, 18: 8 } as const
const UNSELECTED_ROUTE_WIDTH_BY_ZOOM = { 12: 1.5, 15: 3, 18: 4.5 } as const

const TRANSIT_ROUTE_DIRECTION_IMAGE_ID = 'shuttle-route-direction-chevron'

const TRANSIT_ROUTE_DIRECTION_LAYER: LineLayerSpecification = {
  id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  type: 'line',
  source: TRANSIT_ROUTE_SOURCE_ID,
  filter: NO_ROUTE_FILTER,
  layout: {
    'line-cap': 'butt',
    'line-join': 'round',
  },
  paint: {
    'line-pattern': TRANSIT_ROUTE_DIRECTION_IMAGE_ID,
    // Only the selected route is shown, so this matches the lane offset and is
    // slightly wider than the lane so the chevrons read clearly.
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      ...SELECTED_ROUTE_LANE_STOPS.flatMap(({ zoom, arrowWidth }) => [zoom, arrowWidth]),
    ],
    'line-offset': [
      'interpolate',
      ['linear'],
      ['zoom'],
      ...SELECTED_ROUTE_LANE_STOPS.flatMap(({ zoom, offset }) => [zoom, offset]),
    ],
  },
}

export type TransitRouteBounds = [[number, number], [number, number]]

export function getTransitRouteBounds(
  index: TransitIndex,
  geometry: BusRouteGeometry,
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

  if (isMobileLayoutWidth(viewportWidth)) {
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
    geometry: BusRouteGeometry,
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

// Singapore drives on the left, so each direction of the selected route is
// shifted left of travel. Out-and-back sections (e.g. D2) then render as two
// parallel lanes instead of one line with opposing arrows stacked on it.
// MapLibre's positive line-offset is right of the line direction.
function createSelectedRouteOffsetExpression(
  routeMatch: RouteMatchExpression,
): NonNullable<LineLayerSpecification['paint']>['line-offset'] {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...SELECTED_ROUTE_LANE_STOPS.flatMap(({ zoom, offset }) => [
      zoom,
      ['case', routeMatch, offset, 0],
    ]),
  ] as NonNullable<LineLayerSpecification['paint']>['line-offset']
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
      map.setPaintProperty(TRANSIT_ROUTE_CASING_LAYER_ID, 'line-offset', 0)
    }
    map.setPaintProperty(TRANSIT_ROUTE_LAYER_ID, 'line-offset', 0)
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
        ...SELECTED_ROUTE_LANE_STOPS.flatMap(({ zoom, casingWidth }) => [
          zoom,
          ['case', routeMatch, casingWidth, BASE_ROUTE_CASING_WIDTH_BY_ZOOM[zoom]],
        ]),
      ] as LineWidthSpecification,
    )
    map.setPaintProperty(
      TRANSIT_ROUTE_CASING_LAYER_ID,
      'line-offset',
      createSelectedRouteOffsetExpression(routeMatch),
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
      ...SELECTED_ROUTE_LANE_STOPS.flatMap(({ zoom, width }) => [
        zoom,
        ['case', routeMatch, width, UNSELECTED_ROUTE_WIDTH_BY_ZOOM[zoom]],
      ]),
    ] as LineWidthSpecification,
  )
  map.setPaintProperty(
    TRANSIT_ROUTE_LAYER_ID,
    'line-offset',
    createSelectedRouteOffsetExpression(routeMatch),
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
  geometry: BusRouteGeometry,
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
  geometry: BusRouteGeometry,
): TransitRouteLayers {
  const ownsSource = !map.getSource(TRANSIT_ROUTE_SOURCE_ID)
  const ownsCasingLayer = !map.getLayer(TRANSIT_ROUTE_CASING_LAYER_ID)
  const ownsRouteLayer = !map.getLayer(TRANSIT_ROUTE_LAYER_ID)
  const ownsDirectionLayer = !map.getLayer(TRANSIT_ROUTE_DIRECTION_LAYER_ID)
  const ownsDirectionImage = !map.hasImage(TRANSIT_ROUTE_DIRECTION_IMAGE_ID)

  if (ownsSource) {
    map.addSource(TRANSIT_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: geometry,
    })
  }
  if (ownsCasingLayer) map.addLayer(TRANSIT_ROUTE_CASING_LAYER)
  if (ownsRouteLayer) map.addLayer(TRANSIT_ROUTE_LAYER)
  if (ownsDirectionImage) {
    map.addImage(TRANSIT_ROUTE_DIRECTION_IMAGE_ID, createDirectionChevronImage(), {
      pixelRatio: DIRECTION_IMAGE_PIXEL_RATIO,
    })
  }
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
      if (ownsDirectionImage && map.hasImage(TRANSIT_ROUTE_DIRECTION_IMAGE_ID)) {
        map.removeImage(TRANSIT_ROUTE_DIRECTION_IMAGE_ID)
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

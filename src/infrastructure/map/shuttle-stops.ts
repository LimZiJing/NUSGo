import {
  Map,
  Marker,
  Popup,
  type FilterSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import type { TransitStop } from '../../domain/transit/types'
import type { TripEndpoint, TripEndpointRole } from '../../domain/trip/types'
import {
  createBusStopPopupContent,
  createPopupCoordinator,
  type PopupContent,
} from './popup'

export const BUS_STOP_MIN_ZOOM = 14
export const BUS_STOP_LABEL_SOURCE_ID = 'shuttle-stop-labels'
export const BUS_STOP_ACTIVE_LABEL_LAYER_ID = 'shuttle-stop-active-labels'
export const BUS_STOP_INACTIVE_LABEL_LAYER_ID = 'shuttle-stop-inactive-labels'
export const BUS_STOP_INACTIVE_OPACITY = 0.2

const BUS_STOP_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-anchor': 'top',
  'text-field': ['get', 'shortName'],
  'text-font': ['Open Sans Regular'],
  'text-offset': [0, 0.9],
  'text-padding': 2,
  'text-size': [
    'interpolate',
    ['linear'],
    ['zoom'],
    14, 10,
    17, 12,
  ],
  'text-allow-overlap': false,
  'text-ignore-placement': false,
}

function createBusStopLabelLayer(id: string): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: BUS_STOP_LABEL_SOURCE_ID,
    layout: BUS_STOP_LABEL_LAYOUT,
    minzoom: BUS_STOP_MIN_ZOOM,
    paint: {
      'text-color': '#334155',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1,
      'text-opacity': 1,
    },
  }
}

const BUS_STOP_ACTIVE_LABEL_LAYER = createBusStopLabelLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)
const BUS_STOP_INACTIVE_LABEL_LAYER = createBusStopLabelLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)

type BusStopLabelFeature = {
  type: 'Feature'
  properties: {
    stopId: string
    shortName: string
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}

export type BusStopLabelGeoJson = {
  type: 'FeatureCollection'
  features: BusStopLabelFeature[]
}

export function createBusStopLabelGeoJson(stops: readonly TransitStop[]): BusStopLabelGeoJson {
  return {
    type: 'FeatureCollection',
    features: stops
      .filter((stop) => Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude))
      .map((stop) => ({
        type: 'Feature',
        properties: {
          stopId: stop.id,
          shortName: stop.shortName || stop.longName,
        },
        geometry: {
          type: 'Point',
          coordinates: [stop.longitude, stop.latitude],
        },
      })),
  }
}

export function isBusStopVisible(
  zoom: number,
  isSelected: boolean,
  isFocused: boolean,
): boolean {
  return zoom >= BUS_STOP_MIN_ZOOM || isSelected || isFocused
}

function createBusStopMarkerElement(stop: TransitStop): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'bus-stop-marker'
  element.setAttribute('aria-label', `${stop.longName} shuttle stop`)
  return element
}

type BusStopMarker = {
  marker: Marker
  popup: Popup
  popupContent: PopupContent
  unregisterPopup: () => void
  handleOpen: () => void
  handleClose: () => void
}

export interface ShuttleStopMarkers {
  readonly markers: readonly Marker[]
  setSelection(selectedStopIds: readonly string[] | null, selectedRouteColor?: string | null): void
  dispose(): void
}

type ShuttleStopMarkerState = {
  map: Map
  markers: Marker[]
  selectedStopIds: ReadonlySet<string> | null
  selectedRouteColor: string | null
  focusedStopIds: Set<string>
  handleZoom: () => void
}

function getStopIdsFilter(stopIds: ReadonlySet<string>): FilterSpecification {
  return [
    'in',
    ['get', 'stopId'],
    ['literal', Array.from(stopIds)],
  ]
}

export function getBusStopLabelFilters(
  selectedStopIds: ReadonlySet<string> | null,
  focusedStopIds: ReadonlySet<string>,
): { active: FilterSpecification; inactive: FilterSpecification | null } {
  const activeStopIds = new Set(selectedStopIds ?? [])
  for (const stopId of focusedStopIds) activeStopIds.add(stopId)

  if (selectedStopIds === null && focusedStopIds.size === 0) {
    return { active: getStopIdsFilter(activeStopIds), inactive: null }
  }

  return {
    active: getStopIdsFilter(activeStopIds),
    inactive: ['!', getStopIdsFilter(activeStopIds)] as FilterSpecification,
  }
}

export function getBusStopLabelOpacity(
  selectedStopIds: ReadonlySet<string> | null,
): number {
  return selectedStopIds === null ? 1 : BUS_STOP_INACTIVE_OPACITY
}

export function isBusStopDimmed(
  routeSelected: boolean,
  isSelected: boolean,
  isFocused: boolean,
): boolean {
  return routeSelected && !isSelected && !isFocused
}

function updateBusStopMarkerElement(
  marker: Marker,
  isSelected: boolean,
  isVisible: boolean,
  isDimmed: boolean,
  selectedRouteColor: string | null,
): void {
  const element = marker.getElement()
  element.style.setProperty('--bus-stop-selected-color', selectedRouteColor ?? '')
  element.classList.toggle('bus-stop-marker-selected', isSelected)
  element.classList.toggle('bus-stop-marker-dimmed', isDimmed)
  element.classList.toggle('bus-stop-marker-hidden', !isVisible)
  element.style.display = isVisible ? '' : 'none'

  const popup = marker.getPopup()
  if (!isVisible && popup?.isOpen()) popup.remove()
}

function updateBusStopLabelPresentation(state: ShuttleStopMarkerState): void {
  const filters = getBusStopLabelFilters(state.selectedStopIds, state.focusedStopIds)
  const activeMinZoom = state.selectedStopIds !== null || state.focusedStopIds.size > 0
    ? 0
    : BUS_STOP_MIN_ZOOM
  const inactiveOpacity = getBusStopLabelOpacity(state.selectedStopIds)

  if (state.map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)) {
    state.map.setFilter(BUS_STOP_ACTIVE_LABEL_LAYER_ID, filters.active)
    state.map.setLayerZoomRange(BUS_STOP_ACTIVE_LABEL_LAYER_ID, activeMinZoom, 24)
  }

  if (state.map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)) {
    state.map.setFilter(BUS_STOP_INACTIVE_LABEL_LAYER_ID, filters.inactive)
    state.map.setLayerZoomRange(BUS_STOP_INACTIVE_LABEL_LAYER_ID, BUS_STOP_MIN_ZOOM, 24)
    state.map.setPaintProperty(BUS_STOP_INACTIVE_LABEL_LAYER_ID, 'text-opacity', inactiveOpacity)
    state.map.setPaintProperty(
      BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      'text-halo-color',
      inactiveOpacity === 1 ? '#ffffff' : 'rgba(255, 255, 255, 0.2)',
    )
  }
}

function updateBusStopMarkerPresentation(state: ShuttleStopMarkerState): void {
  const zoom = state.map.getZoom()
  const selectedStopIds = state.selectedStopIds
  const selectedIds = selectedStopIds ?? new Set<string>()

  for (const marker of state.markers) {
    const element = marker.getElement()
    const stopId = element.dataset.stopId ?? ''
    const isSelected = selectedIds.has(stopId)
    const isFocused = state.focusedStopIds.has(stopId)
    const routeSelected = selectedStopIds !== null
    const isVisible = isBusStopVisible(zoom, routeSelected && isSelected, isFocused)
    const isDimmed = isBusStopDimmed(routeSelected, isSelected, isFocused)
    updateBusStopMarkerElement(marker, isSelected, isVisible, isDimmed, state.selectedRouteColor)
  }

  updateBusStopLabelPresentation(state)
}

export function createShuttleStopMarkers(
  map: Map,
  busStops: readonly TransitStop[],
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
): ShuttleStopMarkers {
  const markers: Marker[] = []
  const markerDetails: BusStopMarker[] = []
  const popupCoordinator = createPopupCoordinator()
  const state: ShuttleStopMarkerState = {
    map,
    markers,
    selectedStopIds: null,
    selectedRouteColor: null,
    focusedStopIds: new Set<string>(),
    handleZoom: () => updateBusStopMarkerPresentation(state),
  }
  const ownsSource = !map.getSource(BUS_STOP_LABEL_SOURCE_ID)
  const ownsInactiveLayer = !map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)
  const ownsActiveLayer = !map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)

  if (ownsSource) {
    map.addSource(BUS_STOP_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: createBusStopLabelGeoJson(busStops),
    })
  }
  if (ownsInactiveLayer) map.addLayer(BUS_STOP_INACTIVE_LABEL_LAYER)
  if (ownsActiveLayer) map.addLayer(BUS_STOP_ACTIVE_LABEL_LAYER)

  for (const stop of busStops) {
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) continue

    const marker = new Marker({
      anchor: 'center',
      element: createBusStopMarkerElement(stop),
    })
    const element = marker.getElement()
    element.dataset.stopId = stop.id
    const popupContent = createBusStopPopupContent(stop, onSetEndpoint)
    const popup = new Popup({ offset: 24 }).setDOMContent(popupContent.element)
    const unregisterPopup = popupCoordinator.register(popup)
    const handleOpen = () => {
      state.focusedStopIds.add(stop.id)
      updateBusStopMarkerPresentation(state)
    }
    const handleClose = () => {
      state.focusedStopIds.delete(stop.id)
      updateBusStopMarkerPresentation(state)
    }
    popup.on('open', handleOpen)
    popup.on('close', handleClose)
    marker
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(popup)
      .addTo(map)

    markerDetails.push({
      marker,
      popup,
      popupContent,
      unregisterPopup,
      handleOpen,
      handleClose,
    })
    markers.push(marker)
  }

  map.on('zoom', state.handleZoom)
  updateBusStopMarkerPresentation(state)
  let disposed = false

  return {
    markers,
    setSelection(selectedStopIds, selectedRouteColor = null) {
      if (disposed) return
      state.selectedStopIds = selectedStopIds === null ? null : new Set(selectedStopIds)
      state.selectedRouteColor = selectedRouteColor
      updateBusStopMarkerPresentation(state)
    },
    dispose() {
      if (disposed) return
      disposed = true
      map.off('zoom', state.handleZoom)
      for (const detail of markerDetails) {
        detail.unregisterPopup()
        detail.popup.off('open', detail.handleOpen)
        detail.popup.off('close', detail.handleClose)
        detail.popup.remove()
        detail.popupContent.dispose()
        detail.marker.remove()
      }
      markerDetails.length = 0
      markers.length = 0
      popupCoordinator.dispose()
      if (ownsActiveLayer && map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)) {
        map.removeLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)
      }
      if (ownsInactiveLayer && map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)) {
        map.removeLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)
      }
      if (ownsSource && map.getSource(BUS_STOP_LABEL_SOURCE_ID)) {
        map.removeSource(BUS_STOP_LABEL_SOURCE_ID)
      }
    },
  }
}

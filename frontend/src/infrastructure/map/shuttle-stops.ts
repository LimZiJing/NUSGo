import {
  Map,
  Marker,
  Popup,
  type FilterSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import type { TransitStop } from '@navus/shared/transit/types'
import { getOverlayPalette } from './overlay-theme'
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
export const BUS_STOP_OBSTACLE_LAYER_ID = 'shuttle-stop-obstacles'
export const BUS_STOP_OBSTACLE_IMAGE_ID = 'shuttle-stop-obstacle'
// Exactly the 14px marker (including border); any larger box, or the default
// 2px icon-padding, reaches the label's own box and suppresses every label.
export const BUS_STOP_OBSTACLE_SIZE = 14
export const BUS_STOP_LABEL_TEXT_SIZE = 12
// In ems: 12px from the stop coordinate clears the 7px marker radius by 5px.
export const BUS_STOP_LABEL_RADIAL_OFFSET = 1
export const BUS_STOP_INACTIVE_OPACITY = 0.2

export interface JourneyStopRoute {
  readonly routeId: string
  readonly routeName: string
  readonly color: string
}

export const BUS_STOP_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-variable-anchor': ['top', 'bottom'],
  'text-radial-offset': BUS_STOP_LABEL_RADIAL_OFFSET,
  'text-field': ['get', 'shortName'],
  'text-font': ['Noto Sans Regular'],
  'text-padding': 2,
  'text-size': BUS_STOP_LABEL_TEXT_SIZE,
  'text-allow-overlap': false,
  'text-ignore-placement': false,
}

// The stop circles are DOM markers, which MapLibre collision cannot see. This
// invisible icon layer stands in for them. Placement runs from the topmost
// layer down, so it is added after (above) the label layers and its icons are
// placed first, making the labels avoid them.
export const BUS_STOP_OBSTACLE_LAYER: SymbolLayerSpecification = {
  id: BUS_STOP_OBSTACLE_LAYER_ID,
  type: 'symbol',
  source: BUS_STOP_LABEL_SOURCE_ID,
  minzoom: BUS_STOP_MIN_ZOOM,
  layout: {
    'icon-image': BUS_STOP_OBSTACLE_IMAGE_ID,
    'icon-padding': 0,
    'icon-allow-overlap': true,
    'icon-ignore-placement': false,
  },
}

function createTransparentObstacleImage(): {
  width: number
  height: number
  data: Uint8Array
} {
  return {
    width: BUS_STOP_OBSTACLE_SIZE,
    height: BUS_STOP_OBSTACLE_SIZE,
    data: new Uint8Array(BUS_STOP_OBSTACLE_SIZE * BUS_STOP_OBSTACLE_SIZE * 4),
  }
}

// A near-black label with a 2px white halo stays legible over roads, the pink building fill and
// other busy map areas.
export const BUS_STOP_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#0f172a',
  'text-halo-color': '#ffffff',
  'text-halo-width': 2,
  'text-opacity': 1,
}

function createBusStopLabelLayer(id: string): SymbolLayerSpecification {
  const palette = getOverlayPalette()
  return {
    id,
    type: 'symbol',
    source: BUS_STOP_LABEL_SOURCE_ID,
    layout: BUS_STOP_LABEL_LAYOUT,
    minzoom: BUS_STOP_MIN_ZOOM,
    paint: {
      ...BUS_STOP_LABEL_PAINT,
      'text-color': palette.stopText,
      'text-halo-color': palette.stopHalo,
    },
  }
}

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
  element.setAttribute('aria-label', `${stop.longName} bus stop`)
  return element
}

type BusStopMarker = {
  marker: Marker
  popup: Popup
  popupContent: PopupContent
  unregisterPopup: () => void
  handleMarkerClick: (event: MouseEvent) => void
  handleMarkerKeyPress: (event: KeyboardEvent) => void
  handleOpen: () => void
  handleClose: () => void
}

export interface ShuttleStopMarkers {
  readonly markers: readonly Marker[]
  openStopPopup(stopId: string): boolean
  dismissPopup(): boolean
  setStopsPin(stopId: string | null, visible: boolean): boolean
  setSelection(selectedStopIds: readonly string[] | null, selectedRouteColor?: string | null): void
  setJourneyStops(stopRoutes: ReadonlyMap<string, readonly JourneyStopRoute[]> | null): void
  /** Recolours the label layers after the document theme changes. */
  refreshTheme(): void
  dispose(): void
}

type ShuttleStopMarkerState = {
  map: Map
  markers: Marker[]
  selectedStopIds: ReadonlySet<string> | null
  selectedRouteColor: string | null
  journeyStopRoutes: ReadonlyMap<string, readonly JourneyStopRoute[]> | null
  selectedStopId: string | null
  pinVisible: boolean
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
  isDisabled: boolean,
  selectedRouteColor: string | null,
  journeyRoutes: readonly JourneyStopRoute[] | null,
): void {
  const element = marker.getElement()
  const button = element as HTMLButtonElement
  element.style.setProperty('--bus-stop-selected-color', selectedRouteColor ?? '')
  element.style.setProperty('--bus-stop-journey-color', getJourneyStopColor(journeyRoutes))
  element.classList.toggle('bus-stop-marker-selected', isSelected)
  element.classList.toggle('bus-stop-marker-journey', journeyRoutes !== null)
  element.classList.toggle('bus-stop-marker-dimmed', isDimmed)
  element.classList.toggle('bus-stop-marker-disabled', isDisabled)
  element.classList.toggle('bus-stop-marker-hidden', !isVisible)
  marker.setOpacity(isDimmed ? BUS_STOP_INACTIVE_OPACITY : 1)
  element.style.display = isVisible ? '' : 'none'
  element.style.pointerEvents = isDisabled ? 'none' : ''
  button.disabled = isDisabled
  button.tabIndex = isDisabled ? -1 : 0
  element.setAttribute('aria-disabled', String(isDisabled))
  const stopLabel = `${element.dataset.stopName ?? ''} bus stop`
  const routeNames = journeyRoutes?.map(({ routeName }) => routeName) ?? []
  const journeyLabel = routeNames.length === 0
    ? stopLabel
    : `${stopLabel} on Journey ${routeNames.length === 1 ? 'Route' : 'Routes'} ${routeNames.join(', ')}`
  element.setAttribute('aria-label', journeyLabel)
  if (routeNames.length > 0) {
    element.setAttribute('title', journeyLabel)
  } else {
    element.removeAttribute('title')
  }

  const popup = marker.getPopup()
  if ((!isVisible || isDisabled) && popup?.isOpen()) popup.remove()
}

function getJourneyStopColor(routes: readonly JourneyStopRoute[] | null): string {
  const uniqueColors = Array.from(new Set(routes?.map(({ color }) => color) ?? []))
  if (uniqueColors.length === 0) return ''
  if (uniqueColors.length === 1) {
    return `linear-gradient(${uniqueColors[0]}, ${uniqueColors[0]})`
  }

  const degreesPerColor = 360 / uniqueColors.length
  return `conic-gradient(${uniqueColors.map((color, index) => (
    `${color} ${index * degreesPerColor}deg ${(index + 1) * degreesPerColor}deg`
  )).join(', ')})`
}

function updateBusStopLabelPresentation(state: ShuttleStopMarkerState): void {
  const palette = getOverlayPalette()
  const prominentStopIds = state.journeyStopRoutes === null
    ? state.selectedStopIds
    : new Set(state.journeyStopRoutes.keys())
  const focusedStopIds = new Set(state.focusedStopIds)
  if (state.selectedStopId !== null) focusedStopIds.add(state.selectedStopId)
  const filters = getBusStopLabelFilters(prominentStopIds, focusedStopIds)
  const activeMinZoom = prominentStopIds !== null || focusedStopIds.size > 0
    ? 0
    : BUS_STOP_MIN_ZOOM
  const inactiveOpacity = getBusStopLabelOpacity(prominentStopIds)

  if (state.map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)) {
    state.map.setFilter(BUS_STOP_ACTIVE_LABEL_LAYER_ID, filters.active)
    state.map.setLayerZoomRange(BUS_STOP_ACTIVE_LABEL_LAYER_ID, activeMinZoom, 24)
  }

  if (state.map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)) {
    state.map.setFilter(BUS_STOP_INACTIVE_LABEL_LAYER_ID, filters.inactive)
    state.map.setLayerZoomRange(
      BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      state.journeyStopRoutes === null ? BUS_STOP_MIN_ZOOM : 0,
      24,
    )
    state.map.setPaintProperty(BUS_STOP_INACTIVE_LABEL_LAYER_ID, 'text-opacity', inactiveOpacity)
    state.map.setPaintProperty(
      BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      'text-color',
      state.journeyStopRoutes === null ? palette.stopText : palette.stopTextMuted,
    )
    state.map.setPaintProperty(
      BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      'text-halo-color',
      inactiveOpacity === 1 ? palette.stopHalo : palette.stopHaloFaded,
    )
  }
}

function updateBusStopMarkerPresentation(state: ShuttleStopMarkerState): void {
  const zoom = state.map.getZoom()
  const journeyActive = state.journeyStopRoutes !== null
  const journeyStopIds = state.journeyStopRoutes === null
    ? null
    : new Set(state.journeyStopRoutes.keys())
  const selectedStopIds = journeyActive ? journeyStopIds : state.selectedStopIds
  const selectedIds = selectedStopIds ?? new Set<string>()

  for (const marker of state.markers) {
    const element = marker.getElement()
    const stopId = element.dataset.stopId ?? ''
    const isRouteSelected = selectedIds.has(stopId)
    const isContextSelected = state.pinVisible && state.selectedStopId === stopId
    const isSelected = isRouteSelected || isContextSelected
    const isFocused = state.focusedStopIds.has(stopId) || isContextSelected
    const routeSelected = selectedStopIds !== null
    const isVisible = journeyActive || isBusStopVisible(zoom, routeSelected && isSelected, isFocused)
    const isDimmed = journeyActive
      ? !isSelected && !isFocused
      : isBusStopDimmed(routeSelected, isSelected, isFocused)
    const isDisabled = journeyActive && !isSelected && !isFocused
    updateBusStopMarkerElement(
      marker,
      isSelected,
      isVisible,
      isDimmed,
      isDisabled,
      journeyActive || (isContextSelected && !isRouteSelected)
        ? null
        : state.selectedRouteColor,
      state.journeyStopRoutes?.get(stopId) ?? null,
    )
  }

  updateBusStopLabelPresentation(state)
}

export function createShuttleStopMarkers(
  map: Map,
  busStops: readonly TransitStop[],
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
  onStopSelected?: (stopId: string) => boolean,
  routeColors: ReadonlyMap<string, string> = new globalThis.Map(),
): ShuttleStopMarkers {
  const markers: Marker[] = []
  const markerDetails: BusStopMarker[] = []
  const popupCoordinator = createPopupCoordinator()
  // MapLibre's default -14 px offset places the pin tip on the stop coordinate.
  const stopsPinMarker = new Marker({ color: '#64748b' })
  stopsPinMarker.getElement().style.pointerEvents = 'none'
  stopsPinMarker.getElement().setAttribute('aria-hidden', 'true')
  const state: ShuttleStopMarkerState = {
    map,
    markers,
    selectedStopIds: null,
    selectedRouteColor: null,
    journeyStopRoutes: null,
    selectedStopId: null,
    pinVisible: false,
    focusedStopIds: new Set<string>(),
    handleZoom: () => updateBusStopMarkerPresentation(state),
  }
  const ownsSource = !map.getSource(BUS_STOP_LABEL_SOURCE_ID)
  const ownsInactiveLayer = !map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)
  const ownsActiveLayer = !map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)
  const ownsObstacleLayer = !map.getLayer(BUS_STOP_OBSTACLE_LAYER_ID)
  const ownsObstacleImage = !map.hasImage(BUS_STOP_OBSTACLE_IMAGE_ID)

  if (ownsSource) {
    map.addSource(BUS_STOP_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: createBusStopLabelGeoJson(busStops),
    })
  }
  if (ownsInactiveLayer) map.addLayer(createBusStopLabelLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID))
  if (ownsActiveLayer) map.addLayer(createBusStopLabelLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID))
  if (ownsObstacleImage) {
    map.addImage(BUS_STOP_OBSTACLE_IMAGE_ID, createTransparentObstacleImage())
  }
  if (ownsObstacleLayer) map.addLayer(BUS_STOP_OBSTACLE_LAYER)

  for (const stop of busStops) {
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) continue

    const marker = new Marker({
      anchor: 'center',
      element: createBusStopMarkerElement(stop),
    })
    const element = marker.getElement()
    element.dataset.stopId = stop.id
    element.dataset.stopName = stop.longName
    const popupContent = createBusStopPopupContent(stop, onSetEndpoint, routeColors)
    const popup = new Popup({ closeButton: false, offset: 24 }).setDOMContent(popupContent.element)
    const unregisterPopup = popupCoordinator.register(popup)
    const handleMarkerClick = (event: MouseEvent): void => {
      if (!onStopSelected?.(stop.id)) return
      event.stopImmediatePropagation()
    }
    const handleMarkerKeyPress = (event: KeyboardEvent): void => {
      if (!state.pinVisible || (event.code !== 'Enter' && event.code !== 'Space')) return
      event.stopImmediatePropagation()
    }
    element.addEventListener('click', handleMarkerClick, true)
    element.addEventListener('keypress', handleMarkerKeyPress, true)
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
      handleMarkerClick,
      handleMarkerKeyPress,
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
    openStopPopup(stopId) {
      if (disposed) return false
      const detail = markerDetails.find(({ marker }) => marker.getElement().dataset.stopId === stopId)
      if (!detail) return false
      state.focusedStopIds.add(stopId)
      updateBusStopMarkerPresentation(state)
      if (!detail.popup.isOpen()) detail.marker.togglePopup()
      return true
    },
    dismissPopup() {
      return !disposed && popupCoordinator.dismiss()
    },
    setStopsPin(stopId, visible) {
      if (disposed) return false
      const stop = stopId === null ? null : busStops.find(({ id }) => id === stopId)
      if (stopId !== null && (!stop || !markerDetails.some(({ marker }) => (
        marker.getElement().dataset.stopId === stopId
      )))) return false
      state.selectedStopId = stopId
      state.pinVisible = visible
      if (visible && stop) {
        stopsPinMarker.setLngLat([stop.longitude, stop.latitude]).addTo(map)
      } else {
        stopsPinMarker.remove()
      }
      updateBusStopMarkerPresentation(state)
      return true
    },
    setSelection(selectedStopIds, selectedRouteColor = null) {
      if (disposed) return
      state.selectedStopIds = selectedStopIds === null ? null : new Set(selectedStopIds)
      state.selectedRouteColor = selectedRouteColor
      updateBusStopMarkerPresentation(state)
    },
    refreshTheme() {
      if (disposed) return
      const palette = getOverlayPalette()
      if (map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)) {
        map.setPaintProperty(BUS_STOP_ACTIVE_LABEL_LAYER_ID, 'text-color', palette.stopText)
        map.setPaintProperty(BUS_STOP_ACTIVE_LABEL_LAYER_ID, 'text-halo-color', palette.stopHalo)
      }
      updateBusStopLabelPresentation(state)
    },
    setJourneyStops(stopRoutes) {
      if (disposed) return
      if (stopRoutes !== null) state.focusedStopIds.clear()
      state.journeyStopRoutes = stopRoutes === null
        ? null
        : new globalThis.Map(Array.from(
          stopRoutes.entries(),
          ([stopId, routes]) => [stopId, [...routes]],
        ))
      updateBusStopMarkerPresentation(state)
    },
    dispose() {
      if (disposed) return
      disposed = true
      map.off('zoom', state.handleZoom)
      stopsPinMarker.remove()
      for (const detail of markerDetails) {
        detail.marker.getElement().removeEventListener('click', detail.handleMarkerClick, true)
        detail.marker.getElement().removeEventListener('keypress', detail.handleMarkerKeyPress, true)
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
      if (ownsObstacleLayer && map.getLayer(BUS_STOP_OBSTACLE_LAYER_ID)) {
        map.removeLayer(BUS_STOP_OBSTACLE_LAYER_ID)
      }
      if (ownsObstacleImage && map.hasImage(BUS_STOP_OBSTACLE_IMAGE_ID)) {
        map.removeImage(BUS_STOP_OBSTACLE_IMAGE_ID)
      }
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

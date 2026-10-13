import {
  Map,
  Marker,
  Popup,
  type FilterSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import type { TransitStop } from '@navus/shared/transit/types'
import type { TripEndpoint, TripEndpointRole } from '../../domain/trip/types'
import type { MapViewportInsets } from '../../app/contracts/map'
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

export interface JourneyStopRoute {
  readonly routeId: string
  readonly routeName: string
  readonly color: string
}

const BUS_STOP_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-anchor': 'top',
  'text-field': ['get', 'shortName'],
  'text-font': ['Noto Sans Regular'],
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

function createBusStopMarkerElement(stop: TransitStop): {
  button: HTMLButtonElement
  routeNumbers: HTMLSpanElement
} {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'bus-stop-marker'
  element.setAttribute('aria-label', `${stop.longName} shuttle stop`)
  const routeNumbers = document.createElement('span')
  routeNumbers.className = 'bus-stop-marker-route-numbers'
  routeNumbers.setAttribute('aria-hidden', 'true')
  const routeName = document.createElement('span')
  routeName.className = 'bus-stop-marker-route-name'
  routeName.textContent = stop.shortName || stop.longName
  element.append(routeNumbers, routeName)
  return { button: element, routeNumbers }
}

type BusStopMarker = {
  marker: Marker
  routeNumbers: HTMLSpanElement
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
  setViewportInsets(insets: MapViewportInsets): void
  openStopPopup(stopId: string): boolean
  setStopsPin(stopId: string | null, visible: boolean): boolean
  setSelection(selectedStopIds: readonly string[] | null, selectedRouteColor?: string | null): void
  setJourneyStops(stopRoutes: ReadonlyMap<string, readonly JourneyStopRoute[]> | null): void
  dispose(): void
}

type ShuttleStopMarkerState = {
  map: Map
  markerDetails: BusStopMarker[]
  stopsPinMarker: Marker
  selectedStopIds: ReadonlySet<string> | null
  routeStopNumbers: ReadonlyMap<string, string> | null
  selectedRouteColor: string | null
  journeyStopRoutes: ReadonlyMap<string, readonly JourneyStopRoute[]> | null
  selectedStopId: string | null
  pinVisible: boolean
  focusedStopIds: Set<string>
  viewportInsets: MapViewportInsets
  handleZoom: () => void
  handleMove: () => void
  handleResize: () => void
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
  detail: BusStopMarker,
  isSelected: boolean,
  isVisible: boolean,
  isDimmed: boolean,
  isDisabled: boolean,
  selectedRouteColor: string | null,
  journeyRoutes: readonly JourneyStopRoute[] | null,
  routeVisitNumbers: string | null,
): void {
  const { marker, routeNumbers } = detail
  const element = marker.getElement()
  const button = element as HTMLButtonElement
  routeNumbers.textContent = routeVisitNumbers ?? ''
  element.style.setProperty('--bus-stop-selected-color', selectedRouteColor ?? '')
  element.style.setProperty('--bus-stop-journey-color', getJourneyStopColor(journeyRoutes))
  element.classList.toggle('bus-stop-marker-selected', isSelected)
  element.classList.toggle('bus-stop-marker-route', routeVisitNumbers !== null)
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
  const stopLabel = `${element.dataset.stopName ?? ''} shuttle stop`
  const routeLabel = routeVisitNumbers === null
    ? ''
    : `, selected route visit${routeVisitNumbers.includes(',') ? 's' : ''} ${routeVisitNumbers}`
  const routeNames = journeyRoutes?.map(({ routeName }) => routeName) ?? []
  const journeyLabel = routeNames.length === 0
    ? `${stopLabel}${routeLabel}`
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
  const routeLabelsActive = state.selectedStopIds !== null && state.journeyStopRoutes === null

  if (state.map.getLayer(BUS_STOP_ACTIVE_LABEL_LAYER_ID)) {
    if (typeof state.map.setLayoutProperty === 'function') {
      state.map.setLayoutProperty(
        BUS_STOP_ACTIVE_LABEL_LAYER_ID,
        'visibility',
        routeLabelsActive ? 'none' : 'visible',
      )
    }
    state.map.setFilter(BUS_STOP_ACTIVE_LABEL_LAYER_ID, filters.active)
    state.map.setLayerZoomRange(BUS_STOP_ACTIVE_LABEL_LAYER_ID, activeMinZoom, 24)
  }

  if (state.map.getLayer(BUS_STOP_INACTIVE_LABEL_LAYER_ID)) {
    if (typeof state.map.setLayoutProperty === 'function') {
      state.map.setLayoutProperty(
        BUS_STOP_INACTIVE_LABEL_LAYER_ID,
        'visibility',
        routeLabelsActive ? 'none' : 'visible',
      )
    }
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
      state.journeyStopRoutes === null ? '#334155' : '#64748b',
    )
    state.map.setPaintProperty(
      BUS_STOP_INACTIVE_LABEL_LAYER_ID,
      'text-halo-color',
      inactiveOpacity === 1 ? '#ffffff' : 'rgba(255, 255, 255, 0.2)',
    )
  }
}

type ScreenRectangle = {
  left: number
  top: number
  right: number
  bottom: number
}

const ROUTE_LABEL_CLEARANCE = 3
const ROUTE_MARKER_POINT_SIZE = 8

function getMapOverlayRectangles(mapContainer: HTMLElement): ScreenRectangle[] {
  const mapBounds = mapContainer.getBoundingClientRect()
  const siblings = mapContainer.parentElement?.children
  if (!siblings) return []

  const rectangles: ScreenRectangle[] = []
  for (const sibling of Array.from(siblings)) {
    if (!(sibling instanceof HTMLElement) || sibling === mapContainer) continue
    for (const overlay of Array.from(sibling.children)) {
      if (!(overlay instanceof HTMLElement) || getComputedStyle(overlay).pointerEvents === 'none') continue
      const bounds = overlay.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) continue
      rectangles.push({
        left: bounds.left - mapBounds.left,
        top: bounds.top - mapBounds.top,
        right: bounds.right - mapBounds.left,
        bottom: bounds.bottom - mapBounds.top,
      })
    }
  }

  return rectangles
}

function getRouteStopNumbers(stopIds: readonly string[] | null): ReadonlyMap<string, string> | null {
  if (stopIds === null) return null

  const visitsByStop = new globalThis.Map<string, number[]>()
  stopIds.forEach((stopId, index) => {
    const visits = visitsByStop.get(stopId) ?? []
    visits.push(index + 1)
    visitsByStop.set(stopId, visits)
  })
  const numbersByStop = new globalThis.Map<string, string>()
  for (const [stopId, visits] of visitsByStop) {
    numbersByStop.set(stopId, visits.join(', '))
  }
  return numbersByStop
}

function rectanglesOverlap(
  a: ScreenRectangle,
  b: ScreenRectangle,
  gap = ROUTE_LABEL_CLEARANCE,
): boolean {
  return a.left < b.right + gap &&
    a.right + gap > b.left &&
    a.top < b.bottom + gap &&
    a.bottom + gap > b.top
}

function getElementRectangle(
  element: HTMLElement,
  containerBounds: DOMRect,
): ScreenRectangle {
  const bounds = element.getBoundingClientRect()
  return {
    left: bounds.left - containerBounds.left,
    top: bounds.top - containerBounds.top,
    right: bounds.right - containerBounds.left,
    bottom: bounds.bottom - containerBounds.top + ROUTE_MARKER_POINT_SIZE,
  }
}

function getBaseMarkerRectangle(
  element: HTMLElement,
  containerBounds: DOMRect,
): ScreenRectangle {
  const bounds = element.getBoundingClientRect()
  return {
    left: bounds.left - containerBounds.left,
    top: bounds.top - containerBounds.top,
    right: bounds.right - containerBounds.left,
    bottom: bounds.bottom - containerBounds.top,
  }
}

function setRouteMarkerLabel(
  detail: BusStopMarker,
  showName: boolean,
  hideMarker: boolean,
): void {
  const element = detail.marker.getElement()
  const button = element as HTMLButtonElement
  element.classList.toggle('bus-stop-marker-route-name-hidden', !showName)
  element.classList.toggle('bus-stop-marker-layout-hidden', hideMarker)

  if (hideMarker) {
    element.style.visibility = 'hidden'
    element.setAttribute('aria-hidden', 'true')
    button.tabIndex = -1
  } else {
    element.style.visibility = ''
    element.removeAttribute('aria-hidden')
    button.tabIndex = button.disabled ? -1 : 0
  }

  if (typeof detail.marker.setOffset === 'function') {
    const height = element.getBoundingClientRect().height || (showName ? 38 : 24)
    detail.marker.setOffset(element.classList.contains('bus-stop-marker-route')
      ? [0, -(height / 2 + ROUTE_MARKER_POINT_SIZE)]
      : [0, 0])
  }
}

function isRectangleInViewport(rectangle: ScreenRectangle, viewport: ScreenRectangle): boolean {
  return rectangle.left >= viewport.left &&
    rectangle.top >= viewport.top &&
    rectangle.right <= viewport.right &&
    rectangle.bottom <= viewport.bottom
}

function updateRouteStopMarkerLayout(state: ShuttleStopMarkerState): void {
  const routeStopNumbers = state.journeyStopRoutes === null ? state.routeStopNumbers : null
  const routeStops = new Set(routeStopNumbers?.keys() ?? [])

  for (const detail of state.markerDetails) {
    const stopId = detail.marker.getElement().dataset.stopId ?? ''
    setRouteMarkerLabel(detail, false, false)
    if (!routeStops.has(stopId) && typeof detail.marker.setOffset === 'function') {
      detail.marker.setOffset([0, 0])
    }
  }
  state.stopsPinMarker.getElement().style.visibility = ''
  if (routeStopNumbers === null || typeof state.map.getContainer !== 'function') return

  const container = state.map.getContainer()
  const containerBounds = container.getBoundingClientRect()
  const viewport = {
    left: state.viewportInsets.left + ROUTE_LABEL_CLEARANCE,
    top: state.viewportInsets.top + ROUTE_LABEL_CLEARANCE,
    right: container.clientWidth - state.viewportInsets.right - ROUTE_LABEL_CLEARANCE,
    bottom: container.clientHeight - state.viewportInsets.bottom - ROUTE_LABEL_CLEARANCE,
  }
  const overlays = getMapOverlayRectangles(container)
  const markerByStopId = new globalThis.Map<string, BusStopMarker>()
  for (const detail of state.markerDetails) {
    markerByStopId.set(detail.marker.getElement().dataset.stopId ?? '', detail)
  }
  const routeMarkers = Array.from(routeStopNumbers.keys())
    .map((stopId) => markerByStopId.get(stopId))
    .filter((detail): detail is BusStopMarker => detail !== undefined)
  const compactRects = new globalThis.Map<BusStopMarker, ScreenRectangle>()
  const visibleCompactRects: ScreenRectangle[] = []

  for (const detail of routeMarkers) {
    const element = detail.marker.getElement()
    const rect = getElementRectangle(element, containerBounds)
    const overlap = visibleCompactRects.some((placed) => rectanglesOverlap(rect, placed, 0)) ||
      overlays.some((overlay) => rectanglesOverlap(rect, overlay, 0))
    const outside = !isRectangleInViewport(rect, viewport)
    const hideMarker = overlap || outside
    setRouteMarkerLabel(detail, false, hideMarker)
    compactRects.set(detail, rect)
    if (!hideMarker) visibleCompactRects.push(rect)
  }

  const placedLabels: ScreenRectangle[] = []
  for (const detail of routeMarkers) {
    const element = detail.marker.getElement()
    if (element.classList.contains('bus-stop-marker-layout-hidden')) continue

    setRouteMarkerLabel(detail, true, false)
    const rect = getElementRectangle(element, containerBounds)
    const overlapsStop = routeMarkers.some((other) => (
      other !== detail &&
      !other.marker.getElement().classList.contains('bus-stop-marker-layout-hidden') &&
      compactRects.has(other) &&
      rectanglesOverlap(rect, compactRects.get(other)!)
    ))
    const collision = !isRectangleInViewport(rect, viewport) ||
      overlays.some((overlay) => rectanglesOverlap(rect, overlay, 0)) ||
      placedLabels.some((placed) => rectanglesOverlap(rect, placed)) ||
      overlapsStop

    if (collision) {
      setRouteMarkerLabel(detail, false, false)
    } else {
      placedLabels.push(rect)
    }
  }

  const visibleRouteRectangles = routeMarkers
    .filter((detail) => !detail.marker.getElement().classList.contains('bus-stop-marker-layout-hidden'))
    .map(({ marker }) => getElementRectangle(marker.getElement(), containerBounds))
  const stopsPinElement = state.stopsPinMarker.getElement()
  if (state.pinVisible && state.selectedStopId !== null) {
    const stopsPinRect = getBaseMarkerRectangle(stopsPinElement, containerBounds)
    const overlapsRoute = visibleRouteRectangles.some((routeRect) => (
      rectanglesOverlap(stopsPinRect, routeRect, 0)
    ))
    stopsPinElement.style.visibility = overlapsRoute ? 'hidden' : ''
  }

  for (const detail of state.markerDetails) {
    const element = detail.marker.getElement()
    if (routeStops.has(element.dataset.stopId ?? '') || element.style.display === 'none') continue
    const rect = getBaseMarkerRectangle(element, containerBounds)
    const overlapsRoute = visibleRouteRectangles.some((routeRect) => (
      rectanglesOverlap(rect, routeRect, 0)
    ))
    element.style.visibility = overlapsRoute ? 'hidden' : ''
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

  for (const detail of state.markerDetails) {
    const { marker } = detail
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
      detail,
      isSelected,
      isVisible,
      isDimmed,
      isDisabled,
      journeyActive || (isContextSelected && !isRouteSelected)
        ? null
        : state.selectedRouteColor,
      state.journeyStopRoutes?.get(stopId) ?? null,
      state.journeyStopRoutes === null
        ? state.routeStopNumbers?.get(stopId) ?? null
        : null,
    )
  }

  updateRouteStopMarkerLayout(state)
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
    markerDetails,
    stopsPinMarker,
    selectedStopIds: null,
    routeStopNumbers: null,
    selectedRouteColor: null,
    journeyStopRoutes: null,
    selectedStopId: null,
    pinVisible: false,
    focusedStopIds: new Set<string>(),
    viewportInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    handleZoom: () => updateBusStopMarkerPresentation(state),
    handleMove: () => updateRouteStopMarkerLayout(state),
    handleResize: () => updateRouteStopMarkerLayout(state),
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

    const markerElements = createBusStopMarkerElement(stop)
    const marker = new Marker({
      anchor: 'center',
      element: markerElements.button,
    })
    const element = marker.getElement()
    element.dataset.stopId = stop.id
    element.dataset.stopName = stop.longName
    element.dataset.stopShortName = stop.shortName || stop.longName
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
      routeNumbers: markerElements.routeNumbers,
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

  // The collision search reads layout, so avoid running it during every zoom animation frame.
  map.on('zoomend', state.handleZoom)
  map.on('moveend', state.handleMove)
  map.on('resize', state.handleResize)
  map.on('rotateend', state.handleResize)
  map.on('pitchend', state.handleResize)
  updateBusStopMarkerPresentation(state)
  let disposed = false

  return {
    markers,
    setViewportInsets(insets) {
      if (disposed) return
      state.viewportInsets = { ...insets }
      updateRouteStopMarkerLayout(state)
    },
    openStopPopup(stopId) {
      if (disposed) return false
      const detail = markerDetails.find(({ marker }) => marker.getElement().dataset.stopId === stopId)
      if (!detail) return false
      state.focusedStopIds.add(stopId)
      updateBusStopMarkerPresentation(state)
      if (!detail.popup.isOpen()) detail.marker.togglePopup()
      return true
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
      state.routeStopNumbers = getRouteStopNumbers(selectedStopIds)
      state.selectedRouteColor = selectedRouteColor
      updateBusStopMarkerPresentation(state)
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
      map.off('zoomend', state.handleZoom)
      map.off('moveend', state.handleMove)
      map.off('resize', state.handleResize)
      map.off('rotateend', state.handleResize)
      map.off('pitchend', state.handleResize)
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

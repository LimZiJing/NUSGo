import {
  Map,
  Marker,
  Popup,
  type FilterSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import type { TransitStop } from '@navus/shared/transit/types'
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
  const routeDot = document.createElement('span')
  routeDot.className = 'bus-stop-marker-route-dot'
  routeDot.setAttribute('aria-hidden', 'true')
  const routeName = document.createElement('span')
  routeName.className = 'bus-stop-marker-route-name'
  routeName.textContent = stop.shortName || stop.longName
  const routeNumbers = document.createElement('span')
  routeNumbers.className = 'bus-stop-marker-route-numbers'
  routeNumbers.setAttribute('aria-hidden', 'true')
  const routeLeader = document.createElement('span')
  routeLeader.className = 'bus-stop-marker-route-leader'
  routeLeader.setAttribute('aria-hidden', 'true')
  element.append(routeDot, routeName, routeNumbers, routeLeader)
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

type RouteOverflowPanel = {
  element: HTMLDivElement
  list: HTMLOListElement
}

export interface ShuttleStopMarkers {
  readonly markers: readonly Marker[]
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
  routeOverflowPanel: RouteOverflowPanel
  onStopSelected?: (stopId: string) => boolean
  selectedStopIds: ReadonlySet<string> | null
  routeStopNumbers: ReadonlyMap<string, string> | null
  selectedRouteColor: string | null
  journeyStopRoutes: ReadonlyMap<string, readonly JourneyStopRoute[]> | null
  selectedStopId: string | null
  pinVisible: boolean
  focusedStopIds: Set<string>
  handleZoom: () => void
  handleMove: () => void
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

type ScreenSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
}

const BUS_STOP_MARKER_SIZE = 14
const ROUTE_LABEL_CLEARANCE = 3
const ROUTE_LABEL_EDGE_SPACING = 11
const ROUTE_LABEL_SEARCH_STEP = 12
const ROUTE_LABEL_SEARCH_DIRECTIONS = 24
const ROUTE_LABEL_ANGLE_STEP = 15
const ROUTE_LABEL_CHARACTER_WIDTH = 6.5
const ROUTE_LABEL_FIXED_WIDTH = 42

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

function segmentIntersectsRectangle(segment: ScreenSegment, rect: ScreenRectangle): boolean {
  const deltaX = segment.x2 - segment.x1
  const deltaY = segment.y2 - segment.y1
  const p = [-deltaX, deltaX, -deltaY, deltaY]
  const q = [
    segment.x1 - rect.left,
    rect.right - segment.x1,
    segment.y1 - rect.top,
    rect.bottom - segment.y1,
  ]
  let start = 0
  let end = 1

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return false
      continue
    }
    const ratio = q[index] / p[index]
    if (p[index] < 0) start = Math.max(start, ratio)
    else end = Math.min(end, ratio)
    if (start > end) return false
  }
  return true
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  segment: ScreenSegment,
): number {
  const deltaX = segment.x2 - segment.x1
  const deltaY = segment.y2 - segment.y1
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      (point.x - segment.x1) * deltaX + (point.y - segment.y1) * deltaY
    ) / lengthSquared))
  return Math.hypot(
    point.x - (segment.x1 + ratio * deltaX),
    point.y - (segment.y1 + ratio * deltaY),
  )
}

function segmentsIntersect(first: ScreenSegment, second: ScreenSegment): boolean {
  const orientation = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ): number => {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
    return Math.abs(value) < 0.001 ? 0 : Math.sign(value)
  }
  const onSegment = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ): boolean => (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  )
  const a = { x: first.x1, y: first.y1 }
  const b = { x: first.x2, y: first.y2 }
  const c = { x: second.x1, y: second.y1 }
  const d = { x: second.x2, y: second.y2 }
  const firstC = orientation(a, b, c)
  const firstD = orientation(a, b, d)
  const secondA = orientation(c, d, a)
  const secondB = orientation(c, d, b)

  return (firstC !== firstD && secondA !== secondB) ||
    (firstC === 0 && onSegment(a, c, b)) ||
    (firstD === 0 && onSegment(a, d, b)) ||
    (secondA === 0 && onSegment(c, a, d)) ||
    (secondB === 0 && onSegment(c, b, d))
}

function segmentsOverlap(
  first: ScreenSegment,
  second: ScreenSegment,
  gap = ROUTE_LABEL_CLEARANCE,
): boolean {
  return segmentsIntersect(first, second) ||
    pointToSegmentDistance({ x: first.x1, y: first.y1 }, second) <= gap ||
    pointToSegmentDistance({ x: first.x2, y: first.y2 }, second) <= gap ||
    pointToSegmentDistance({ x: second.x1, y: second.y1 }, first) <= gap ||
    pointToSegmentDistance({ x: second.x2, y: second.y2 }, first) <= gap
}

function segmentIntersectsCircle(
  segment: ScreenSegment,
  point: { x: number; y: number },
  radius: number,
): boolean {
  return pointToSegmentDistance(point, segment) <= radius
}

function createRouteOverflowPanel(): RouteOverflowPanel {
  const element = document.createElement('div')
  element.className = 'bus-stop-route-overflow'
  element.setAttribute('role', 'region')
  element.setAttribute('aria-label', 'Selected route stops')
  element.hidden = true
  const list = document.createElement('ol')
  list.className = 'bus-stop-route-overflow-list'
  element.append(list)
  return { element, list }
}

function updateRouteOverflowPanel(
  panel: RouteOverflowPanel,
  routeMarkers: readonly BusStopMarker[],
  routeStopNumbers: ReadonlyMap<string, string>,
  onStopSelected?: (stopId: string) => boolean,
): void {
  panel.list.replaceChildren()
  for (const detail of routeMarkers) {
    const markerElement = detail.marker.getElement()
    const stopId = markerElement.dataset.stopId ?? ''
    const item = document.createElement('li')
    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'bus-stop-route-overflow-name'
    name.textContent = markerElement.dataset.stopShortName ?? markerElement.dataset.stopName ?? ''
    const visitNumbers = routeStopNumbers.get(stopId) ?? ''
    name.setAttribute(
      'aria-label',
      name.textContent + ' shuttle stop, selected route visit' +
        (visitNumbers.includes(',') ? 's' : '') + ' ' + visitNumbers,
    )
    name.addEventListener('click', (event) => {
      if (onStopSelected?.(stopId)) event.stopImmediatePropagation()
    })
    const numbers = document.createElement('span')
    numbers.className = 'bus-stop-route-overflow-numbers'
    numbers.textContent = visitNumbers
    item.append(name, numbers)
    panel.list.append(item)
  }
}

function updateRouteStopMarkerLayout(state: ShuttleStopMarkerState): void {
  const routeStopNumbers = state.journeyStopRoutes === null
    ? state.routeStopNumbers
    : null

  if (routeStopNumbers === null) {
    state.routeOverflowPanel.element.hidden = true
    state.stopsPinMarker.getElement().style.visibility = ''
    for (const { marker } of state.markerDetails) {
      if (typeof marker.setOffset === 'function') marker.setOffset([0, 0])
      const element = marker.getElement()
      element.classList.remove('bus-stop-marker-route-overflow')
      element.style.setProperty('--bus-stop-leader-length', '0px')
      element.style.setProperty('--bus-stop-leader-angle', '0deg')
    }
    return
  }

  for (const { marker } of state.markerDetails) {
    if (typeof marker.setOffset === 'function') marker.setOffset([0, 0])
    const element = marker.getElement()
    element.classList.remove('bus-stop-marker-route-overflow')
    element.style.setProperty('--bus-stop-leader-length', '0px')
  }
  state.stopsPinMarker.getElement().style.visibility = ''

  if (
    typeof state.map.project !== 'function' ||
    typeof state.map.getContainer !== 'function'
  ) return

  const markerByStopId = new globalThis.Map<string, BusStopMarker>()
  for (const detail of state.markerDetails) {
    markerByStopId.set(detail.marker.getElement().dataset.stopId ?? '', detail)
  }
  const routeMarkers = Array.from(routeStopNumbers.keys())
    .map((stopId) => markerByStopId.get(stopId))
    .filter((detail): detail is BusStopMarker => detail !== undefined)
  if (routeMarkers.length === 0) {
    state.routeOverflowPanel.element.hidden = true
    return
  }

  const container = state.map.getContainer()
  const viewportWidth = container.clientWidth
  const viewportHeight = container.clientHeight
  const routePoints = routeMarkers.map((detail) => {
    const { marker } = detail
    const point = state.map.project(marker.getLngLat())
    return { detail, marker, x: point.x, y: point.y }
  })
  const center = routePoints.reduce(
    (point, next) => ({
      x: point.x + next.x / routePoints.length,
      y: point.y + next.y / routePoints.length,
    }),
    { x: 0, y: 0 },
  )
  const visibleStopPoints = state.markerDetails
    .filter(({ marker }) => marker.getElement().style.display !== 'none')
    .map(({ marker }) => {
      const point = state.map.project(marker.getLngLat())
      return {
        stopId: marker.getElement().dataset.stopId ?? '',
        x: point.x,
        y: point.y,
      }
    })
  const stopsPinElement = state.stopsPinMarker.getElement()
  const containerBounds = container.getBoundingClientRect()
  const pinBounds = state.pinVisible && state.selectedStopId !== null
    ? stopsPinElement.getBoundingClientRect()
    : null
  const visiblePinRect = pinBounds === null
    ? null
    : {
      left: pinBounds.left - containerBounds.left,
      top: pinBounds.top - containerBounds.top,
      right: pinBounds.right - containerBounds.left,
      bottom: pinBounds.bottom - containerBounds.top,
    }
  const placedLabels: ScreenRectangle[] = []
  const placedLeaders: ScreenSegment[] = []
  const placements: Array<{
    detail: BusStopMarker
    x: number
    y: number
    width: number
    height: number
  }> = []

  for (const { detail, marker, x, y } of routePoints) {
    const element = marker.getElement()
    element.classList.remove('bus-stop-marker-route-overflow')
    const bounds = element.getBoundingClientRect()
    const width = Math.max(
      bounds.width,
      (element.dataset.stopShortName?.length ?? 0) * ROUTE_LABEL_CHARACTER_WIDTH +
        (routeStopNumbers.get(element.dataset.stopId ?? '')?.length ?? 0) *
          ROUTE_LABEL_CHARACTER_WIDTH + ROUTE_LABEL_FIXED_WIDTH,
    )
    const height = Math.max(bounds.height, 24)
    const dx = x - center.x
    const dy = y - center.y
    const preferredAngle = Math.hypot(dx, dy) < 0.5
      ? 0
      : Math.atan2(dx, -dy) * 180 / Math.PI
    let placement: {
      x: number
      y: number
      rect: ScreenRectangle
      leader: ScreenSegment
    } | null = null

    for (
      let extra = 0;
      extra <= viewportWidth + viewportHeight;
      extra += ROUTE_LABEL_SEARCH_STEP
    ) {
      for (let step = 0; step < ROUTE_LABEL_SEARCH_DIRECTIONS; step += 1) {
        const angle = (preferredAngle + step * ROUTE_LABEL_ANGLE_STEP) * Math.PI / 180
        const directionX = Math.sin(angle)
        const directionY = -Math.cos(angle)
        const edgeDistance = Math.abs(directionX) * width / 2 +
          Math.abs(directionY) * height / 2
        const distance = edgeDistance + ROUTE_LABEL_EDGE_SPACING + extra
        const offsetX = directionX * distance
        const offsetY = directionY * distance
        const rect = {
          left: x + offsetX - width / 2,
          top: y + offsetY - height / 2,
          right: x + offsetX + width / 2,
          bottom: y + offsetY + height / 2,
        }
        const overflow = Math.max(0, -rect.left) + Math.max(0, -rect.top) +
          Math.max(0, rect.right - viewportWidth) + Math.max(0, rect.bottom - viewportHeight)
        const leaderStartDistance = Math.abs(directionX) * width / 2 +
          Math.abs(directionY) * height / 2
        const leader: ScreenSegment = {
          x1: x + directionX * BUS_STOP_MARKER_SIZE / 2,
          y1: y + directionY * BUS_STOP_MARKER_SIZE / 2,
          x2: x + directionX * (distance - leaderStartDistance),
          y2: y + directionY * (distance - leaderStartDistance),
        }
        const stopOverlap = visibleStopPoints.some((otherPoint) => (
          otherPoint.stopId !== element.dataset.stopId &&
          rectanglesOverlap(rect, {
            left: otherPoint.x - BUS_STOP_MARKER_SIZE / 2,
            top: otherPoint.y - BUS_STOP_MARKER_SIZE / 2,
            right: otherPoint.x + BUS_STOP_MARKER_SIZE / 2,
            bottom: otherPoint.y + BUS_STOP_MARKER_SIZE / 2,
          }, ROUTE_LABEL_CLEARANCE)
        )) || (visiblePinRect !== null && rectanglesOverlap(
          rect,
          visiblePinRect,
          ROUTE_LABEL_CLEARANCE,
        ))
        const labelOverlap = placedLabels.some((placed) => rectanglesOverlap(rect, placed))
        const labelOverlapsLeader = placedLeaders.some((placed) => (
          segmentIntersectsRectangle(placed, {
            left: rect.left - ROUTE_LABEL_CLEARANCE,
            top: rect.top - ROUTE_LABEL_CLEARANCE,
            right: rect.right + ROUTE_LABEL_CLEARANCE,
            bottom: rect.bottom + ROUTE_LABEL_CLEARANCE,
          })
        ))
        const leaderOverlapsStop = visibleStopPoints.some((otherPoint) => (
          otherPoint.stopId !== element.dataset.stopId &&
          segmentIntersectsCircle(
            leader,
            otherPoint,
            BUS_STOP_MARKER_SIZE / 2 + ROUTE_LABEL_CLEARANCE,
          )
        )) || (visiblePinRect !== null && segmentIntersectsRectangle(leader, visiblePinRect))
        const leaderOverlapsLabel = placedLabels.some((placed) => (
          segmentIntersectsRectangle(leader, {
            left: placed.left - ROUTE_LABEL_CLEARANCE,
            top: placed.top - ROUTE_LABEL_CLEARANCE,
            right: placed.right + ROUTE_LABEL_CLEARANCE,
            bottom: placed.bottom + ROUTE_LABEL_CLEARANCE,
          })
        ))
        const leaderOverlapsLeader = placedLeaders.some((placed) => (
          segmentsOverlap(leader, placed)
        ))

        if (
          overflow === 0 &&
          !stopOverlap &&
          !labelOverlap &&
          !labelOverlapsLeader &&
          !leaderOverlapsStop &&
          !leaderOverlapsLabel &&
          !leaderOverlapsLeader
        ) {
          placement = { x: offsetX, y: offsetY, rect, leader }
          break
        }
      }
      if (placement) break
    }

    if (!placement) break
    placedLabels.push(placement.rect)
    placedLeaders.push(placement.leader)
    placements.push({
      detail,
      x: placement.x,
      y: placement.y,
      width,
      height,
    })
  }

  if (placements.length !== routeMarkers.length) {
    for (const { marker } of state.markerDetails) {
      if (typeof marker.setOffset === 'function') marker.setOffset([0, 0])
      marker.getElement().classList.add('bus-stop-marker-route-overflow')
    }
    state.stopsPinMarker.getElement().style.visibility = 'hidden'
    updateRouteOverflowPanel(
      state.routeOverflowPanel,
      routeMarkers,
      routeStopNumbers,
      state.onStopSelected,
    )
    state.routeOverflowPanel.element.hidden = false
    return
  }

  state.routeOverflowPanel.element.hidden = true
  for (const { detail, x, y, width, height } of placements) {
    const { marker } = detail
    const element = marker.getElement()
    marker.setOffset([x, y])
    const distance = Math.hypot(x, y)
    const directionX = x / distance
    const directionY = y / distance
    const leaderStartDistance = Math.abs(directionX) * width / 2 +
      Math.abs(directionY) * height / 2
    const leaderLength = Math.max(
      0,
      distance - leaderStartDistance - BUS_STOP_MARKER_SIZE / 2,
    )
    element.style.setProperty('--bus-stop-leader-length', `${leaderLength}px`)
    element.style.setProperty(
      '--bus-stop-leader-angle',
      `${Math.atan2(-directionY, -directionX) * 180 / Math.PI}deg`,
    )
    element.style.setProperty(
      '--bus-stop-leader-start-x',
      `${width / 2 - directionX * leaderStartDistance}px`,
    )
    element.style.setProperty(
      '--bus-stop-leader-start-y',
      `${height / 2 - directionY * leaderStartDistance}px`,
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
  const routeOverflowPanel = createRouteOverflowPanel()
  map.getContainer().append(routeOverflowPanel.element)
  // MapLibre's default -14 px offset places the pin tip on the stop coordinate.
  const stopsPinMarker = new Marker({ color: '#64748b' })
  stopsPinMarker.getElement().style.pointerEvents = 'none'
  stopsPinMarker.getElement().setAttribute('aria-hidden', 'true')
  const state: ShuttleStopMarkerState = {
    map,
    markerDetails,
    stopsPinMarker,
    routeOverflowPanel,
    onStopSelected,
    selectedStopIds: null,
    routeStopNumbers: null,
    selectedRouteColor: null,
    journeyStopRoutes: null,
    selectedStopId: null,
    pinVisible: false,
    focusedStopIds: new Set<string>(),
    handleZoom: () => updateBusStopMarkerPresentation(state),
    handleMove: () => updateRouteStopMarkerLayout(state),
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

  map.on('zoom', state.handleZoom)
  map.on('moveend', state.handleMove)
  map.on('resize', state.handleMove)
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
      map.off('zoom', state.handleZoom)
      map.off('moveend', state.handleMove)
      map.off('resize', state.handleMove)
      routeOverflowPanel.element.remove()
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

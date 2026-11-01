import { Marker, Popup, type Map } from 'maplibre-gl'
import {
  SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS,
  type ShuttleVehiclePosition,
} from '@nusgo/shared'
import type { TransitGeoJsonPosition, TransitStop } from '@nusgo/shared/transit/types'
import type { LoadedTransitData } from '../../app/contracts/data'
import { isClosedRoute, interpolateRoutePosition, snapToRoute } from './live-bus-routing'
import { createPopupCoordinator, type PopupContent } from './popup'

const STALE_REMAINING_MS = SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS
const LOAD_LEVEL_BAR_COUNTS: Readonly<Record<ShuttleVehiclePosition['load'], number>> = {
  low: 1,
  medium: 2,
  high: 3,
  unknown: 0,
}

interface LiveBusMarkerRecord {
  readonly marker: Marker
  readonly element: HTMLButtonElement
  readonly popup: Popup
  popupContent: PopupContent
  readonly unregisterPopup: () => void
  vehicle: ShuttleVehiclePosition
  routeCoordinates: readonly TransitGeoJsonPosition[] | null
  progressMeters: number | null
  animation: {
    readonly fromProgressMeters: number
    readonly toProgressMeters: number
    readonly startedAt: number
    readonly durationMs: number
  } | null
  animationFrame: number | null
  staleTimer: ReturnType<typeof setTimeout> | null
  expiryTimer: ReturnType<typeof setTimeout> | null
}

export interface LiveBusMarkers {
  setTransitData(data: Pick<LoadedTransitData, 'index' | 'geometry'>): void
  setVehicles(vehicles: readonly ShuttleVehiclePosition[], visible: boolean): void
  dispose(): void
}

function vehicleKey(vehicle: ShuttleVehiclePosition): string {
  return `${vehicle.routeId}:${vehicle.plate}`
}

function getNextStop(
  vehicle: ShuttleVehiclePosition,
  progressMeters: number | null,
  routeCoordinates: readonly TransitGeoJsonPosition[] | null,
  transitData: Pick<LoadedTransitData, 'index' | 'geometry'> | null,
): TransitStop | null {
  if (progressMeters === null || routeCoordinates === null || transitData === null) return null
  const route = transitData.index.routeById.get(vehicle.routeId)
  if (!route) return null

  const stops = route.stopIds.flatMap((stopId) => {
    const stop = transitData.index.stopById.get(stopId)
    if (!stop) return []
    const position = snapToRoute([stop.longitude, stop.latitude], routeCoordinates)
    return position ? [{ stop, progressMeters: position.progressMeters }] : []
  }).sort((first, second) => first.progressMeters - second.progressMeters)
  const nextStop = stops.find(({ progressMeters: stopProgress }) => stopProgress > progressMeters + 5)
  if (nextStop) return nextStop.stop
  return isClosedRoute(routeCoordinates) ? stops[0]?.stop ?? null : null
}

function createLiveBusPopupContent(
  routeName: string,
  vehicle: ShuttleVehiclePosition,
  nextStop: TransitStop | null,
  onSelectStop?: (stopId: string) => void,
): PopupContent {
  const element = document.createElement('div')
  element.className = 'map-popup-content live-bus-popup-content'
  const title = document.createElement('strong')
  title.className = 'map-popup-title'
  title.textContent = routeName
  element.append(title)

  const nextStopDetail = document.createElement('div')
  nextStopDetail.className = 'map-popup-detail'
  nextStopDetail.textContent = nextStop ? `Next stop: ${nextStop.longName}` : 'Next stop unavailable'
  element.append(nextStopDetail)

  const loadDetail = document.createElement('div')
  loadDetail.className = 'map-popup-detail'
  loadDetail.textContent = vehicle.load === 'unknown'
    ? 'Estimated crowding unavailable'
    : `Estimated crowding: ${vehicle.load}`
  element.append(loadDetail)

  const button = nextStop && onSelectStop ? document.createElement('button') : null
  const handleSelectStop = nextStop && onSelectStop
    ? () => onSelectStop(nextStop.id)
    : null
  if (button && nextStop) {
    button.type = 'button'
    button.className = 'live-bus-popup-stop-action'
    button.textContent = 'View stop details'
    button.setAttribute('aria-label', `View details for ${nextStop.longName} bus stop`)
    if (handleSelectStop) button.addEventListener('click', handleSelectStop)
    element.append(button)
  }

  return {
    element,
    dispose() {
      if (button && handleSelectStop) button.removeEventListener('click', handleSelectStop)
    },
  }
}

function createMarkerElement(
  vehicle: ShuttleVehiclePosition,
  routeName: string,
  nextStop: TransitStop | null,
): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'live-bus-marker'
  element.dataset.routeId = vehicle.routeId
  element.dataset.loadLevel = vehicle.load

  const heading = document.createElement('span')
  heading.className = 'live-bus-marker-heading'
  heading.setAttribute('aria-hidden', 'true')
  element.append(heading)
  const loadCue = document.createElement('span')
  loadCue.className = 'live-bus-marker-load'
  loadCue.setAttribute('aria-hidden', 'true')
  updateMarkerLoadCue(loadCue, vehicle.load)
  element.append(loadCue)
  updateMarkerLabel(element, routeName, vehicle, nextStop)
  return element
}

function updateMarkerLoadCue(
  element: HTMLSpanElement,
  load: ShuttleVehiclePosition['load'],
): void {
  element.replaceChildren(...Array.from({ length: LOAD_LEVEL_BAR_COUNTS[load] }, () => {
    const bar = document.createElement('span')
    return bar
  }))
}

function updateMarkerLabel(
  element: HTMLButtonElement,
  routeName: string,
  vehicle: ShuttleVehiclePosition,
  nextStop: TransitStop | null,
): void {
  const crowding = vehicle.load === 'unknown'
    ? 'Crowding estimate unavailable.'
    : `Estimated crowding: ${vehicle.load}.`
  const nextStopLabel = nextStop ? ` Next stop: ${nextStop.longName}.` : ''
  element.setAttribute('aria-label', `${routeName} bus.${nextStopLabel} ${crowding}`)
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer)
}

function toMutableCoordinate(coordinate: readonly [number, number]): [number, number] {
  return [coordinate[0], coordinate[1]]
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function stopAnimation(record: LiveBusMarkerRecord): void {
  if (record.animationFrame !== null) cancelAnimationFrame(record.animationFrame)
  record.animationFrame = null
  record.animation = null
}

export function createLiveBusMarkers(
  map: Map,
  onSelectStop?: (stopId: string) => void,
): LiveBusMarkers {
  const records = new globalThis.Map<string, LiveBusMarkerRecord>()
  const routeCoordinatesById = new globalThis.Map<string, readonly TransitGeoJsonPosition[]>()
  const popupCoordinator = createPopupCoordinator()
  let transitData: Pick<LoadedTransitData, 'index' | 'geometry'> | null = null
  let disposed = false
  let activeVehicles: readonly ShuttleVehiclePosition[] = []
  let visible = false

  const removeRecord = (key: string): void => {
    const record = records.get(key)
    if (!record) return
    clearTimer(record.staleTimer)
    clearTimer(record.expiryTimer)
    stopAnimation(record)
    record.unregisterPopup()
    record.popupContent.dispose()
    record.popup.remove()
    record.marker.remove()
    records.delete(key)
  }

  const scheduleLifecycle = (key: string, record: LiveBusMarkerRecord): void => {
    clearTimer(record.staleTimer)
    clearTimer(record.expiryTimer)
    const now = Date.now()
    const expiresAt = Date.parse(record.vehicle.expiresAt)
    const staleAt = expiresAt - STALE_REMAINING_MS

    if (staleAt <= now) {
      record.element.classList.add('live-bus-marker-stale')
    } else {
      record.element.classList.remove('live-bus-marker-stale')
      record.staleTimer = setTimeout(() => {
        if (records.get(key) === record) record.element.classList.add('live-bus-marker-stale')
      }, staleAt - now)
    }

    record.expiryTimer = setTimeout(() => removeRecord(key), Math.max(0, expiresAt - now))
  }

  const clearRecords = (): void => {
    for (const key of records.keys()) removeRecord(key)
  }

  const animateRecord = (key: string, record: LiveBusMarkerRecord): void => {
    const animation = record.animation
    const routeCoordinates = record.routeCoordinates
    if (!animation || !routeCoordinates || records.get(key) !== record) return

    const progress = Math.min(1, Math.max(0, (Date.now() - animation.startedAt) / animation.durationMs))
    const routePosition = interpolateRoutePosition(
      routeCoordinates,
      animation.fromProgressMeters,
      animation.toProgressMeters,
      progress,
    )
    if (routePosition) {
      record.progressMeters = routePosition.progressMeters
      record.marker.setLngLat(toMutableCoordinate(routePosition.coordinate))
    }

    if (progress < 1) {
      record.animationFrame = requestAnimationFrame(() => animateRecord(key, record))
    } else {
      record.animationFrame = null
      record.animation = null
    }
  }

  const updateRecord = (
    key: string,
    record: LiveBusMarkerRecord,
    vehicle: ShuttleVehiclePosition,
    routeCoordinates: readonly TransitGeoJsonPosition[] | null,
  ): void => {
    const now = Date.now()
    const previousRouteCoordinates = record.routeCoordinates
    const previousPosition = previousRouteCoordinates && record.animation
      ? interpolateRoutePosition(
        previousRouteCoordinates,
        record.animation.fromProgressMeters,
        record.animation.toProgressMeters,
        (now - record.animation.startedAt) / record.animation.durationMs,
      )
      : previousRouteCoordinates && record.progressMeters !== null
        ? interpolateRoutePosition(
          previousRouteCoordinates,
          record.progressMeters,
          record.progressMeters,
          0,
        )
        : null
    const sameRoute = record.vehicle.routeId === vehicle.routeId &&
      previousRouteCoordinates === routeCoordinates
    const previousObservedAt = Date.parse(record.vehicle.observedAt)
    const nextObservedAt = Date.parse(vehicle.observedAt)
    const observedInterval = nextObservedAt - previousObservedAt
    const durationMs = Number.isFinite(observedInterval) && observedInterval > 0
      ? Math.min(observedInterval, SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS)
      : SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS
    const routePosition = routeCoordinates
      ? snapToRoute([vehicle.lng, vehicle.lat], routeCoordinates)
      : null
    const routeName = transitData?.index.routeById.get(vehicle.routeId)?.name ?? vehicle.routeId
    const nextStop = getNextStop(
      vehicle,
      routePosition?.progressMeters ?? null,
      routeCoordinates,
      transitData,
    )

    stopAnimation(record)
    record.vehicle = vehicle
    record.routeCoordinates = routeCoordinates
    record.element.dataset.loadLevel = vehicle.load
    updateMarkerLoadCue(record.element.querySelector('.live-bus-marker-load')!, vehicle.load)
    updateMarkerLabel(record.element, routeName, vehicle, nextStop)
    record.popupContent.dispose()
    record.popupContent = createLiveBusPopupContent(routeName, vehicle, nextStop, onSelectStop)
    record.popup.setDOMContent(record.popupContent.element)
    record.marker.setRotation(vehicle.headingDegrees)

    if (
      sameRoute &&
      routeCoordinates &&
      previousPosition &&
      routePosition &&
      !prefersReducedMotion() &&
      typeof requestAnimationFrame === 'function'
    ) {
      record.progressMeters = previousPosition.progressMeters
      record.marker.setLngLat(toMutableCoordinate(previousPosition.coordinate))
      record.animation = {
        fromProgressMeters: previousPosition.progressMeters,
        toProgressMeters: routePosition.progressMeters,
        startedAt: now,
        durationMs,
      }
      record.animationFrame = requestAnimationFrame(() => animateRecord(key, record))
      return
    }

    record.progressMeters = routePosition?.progressMeters ?? null
    record.marker.setLngLat(routePosition ? toMutableCoordinate(routePosition.coordinate) : [vehicle.lng, vehicle.lat])
  }

  const applyVehicles = (): void => {
    if (disposed || !visible) {
      clearRecords()
      return
    }

    const now = Date.now()
    const seen = new Set<string>()
    for (const vehicle of activeVehicles) {
      const expiresAt = Date.parse(vehicle.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= now) continue
      const key = vehicleKey(vehicle)
      seen.add(key)
      const routeCoordinates = routeCoordinatesById.get(vehicle.routeId) ?? null
      const existing = records.get(key)
      if (existing) {
        updateRecord(key, existing, vehicle, routeCoordinates)
        scheduleLifecycle(key, existing)
        continue
      }

      const routePosition = routeCoordinates
        ? snapToRoute([vehicle.lng, vehicle.lat], routeCoordinates)
        : null
      const routeName = transitData?.index.routeById.get(vehicle.routeId)?.name ?? vehicle.routeId
      const nextStop = getNextStop(
        vehicle,
        routePosition?.progressMeters ?? null,
        routeCoordinates,
        transitData,
      )
      const element = createMarkerElement(vehicle, routeName, nextStop)
      const popupContent = createLiveBusPopupContent(routeName, vehicle, nextStop, onSelectStop)
      const popup = new Popup({ closeButton: true, offset: 18 }).setDOMContent(popupContent.element)
      const unregisterPopup = popupCoordinator.register(popup)
      const record: LiveBusMarkerRecord = {
        marker: new Marker({ element, anchor: 'center' })
          .setRotationAlignment('map')
          .setLngLat(routePosition ? toMutableCoordinate(routePosition.coordinate) : [vehicle.lng, vehicle.lat])
          .setRotation(vehicle.headingDegrees)
          .setPopup(popup)
          .addTo(map),
        element,
        popup,
        popupContent,
        unregisterPopup,
        vehicle,
        routeCoordinates,
        progressMeters: routePosition?.progressMeters ?? null,
        animation: null,
        animationFrame: null,
        staleTimer: null,
        expiryTimer: null,
      }
      records.set(key, record)
      scheduleLifecycle(key, record)
    }

    for (const key of records.keys()) {
      if (!seen.has(key)) removeRecord(key)
    }
  }

  return {
    setTransitData(data) {
      transitData = data
      routeCoordinatesById.clear()
      for (const feature of data.geometry.features) {
        routeCoordinatesById.set(feature.properties.routeId, feature.geometry.coordinates)
      }
      applyVehicles()
    },

    setVehicles(vehicles, nextVisible) {
      activeVehicles = vehicles
      visible = nextVisible
      applyVehicles()
    },

    dispose() {
      if (disposed) return
      disposed = true
      clearRecords()
      popupCoordinator.dispose()
    },
  }
}

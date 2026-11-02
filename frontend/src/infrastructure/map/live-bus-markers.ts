import { Marker, Popup, type Map } from 'maplibre-gl'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS,
  type ShuttleVehiclePosition,
} from '@nusgo/shared'
import type { TransitGeoJsonPosition, TransitStop } from '@nusgo/shared/transit/types'
import type { LoadedTransitData } from '../../app/contracts/data'
import { isClosedRoute, interpolateRoutePosition, snapToRoute } from './live-bus-routing'
import { createPopupCoordinator, type PopupContent } from './popup'
import { getRouteContrastTextColor } from '../../domain/transit/route-color'
import { CloseIcon } from '../../ui/icons'
import { IconButton } from '../../ui/button'
import { LiveBusVehicle } from './live-bus-vehicle'

const STALE_REMAINING_MS = SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS

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

// Render the shared controls into MapLibre-owned DOM; native listeners are disposed below.
function createPopupButton(control: ReactElement): HTMLButtonElement {
  const template = document.createElement('template')
  template.innerHTML = renderToStaticMarkup(control)
  const button = template.content.firstElementChild
  if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a popup button')
  return button
}

function createLiveBusPopupContent(
  routeName: string,
  vehicle: ShuttleVehiclePosition,
  nextStop: TransitStop | null,
  routeColor: string | undefined,
  onClose: () => void,
  onSelectStop?: (stopId: string) => void,
): PopupContent {
  const element = document.createElement('div')
  element.className = 'map-popup-content live-bus-popup-content'
  updateMarkerRouteColor(element, routeColor)
  const header = document.createElement('div')
  header.className = 'live-bus-popup-header'
  const routeBadge = document.createElement('strong')
  routeBadge.className = 'live-bus-popup-route'
  routeBadge.textContent = vehicle.routeId
  routeBadge.title = routeName
  const loadValue = document.createElement('span')
  loadValue.className = 'live-bus-popup-load-value'
  loadValue.dataset.loadLevel = vehicle.load
  loadValue.textContent = vehicle.load === 'unknown'
    ? 'Crowding unknown'
    : `${vehicle.load[0].toUpperCase() + vehicle.load.slice(1)} crowding`
  loadValue.setAttribute('aria-label', vehicle.load === 'unknown'
    ? 'Crowding estimate unavailable'
    : `Estimated crowding: ${vehicle.load}`)
  loadValue.title = 'Estimated crowding'
  const closeButton = createPopupButton(createElement(IconButton, {
    label: 'Close bus details', icon: createElement(CloseIcon), variant: 'plain',
    className: 'live-bus-popup-close', onClick: onClose,
  }))
  closeButton.addEventListener('click', onClose)
  header.append(routeBadge, loadValue, closeButton)
  element.append(header)

  const nextStopDetail = document.createElement('div')
  nextStopDetail.className = 'live-bus-popup-next-stop'
  const nextStopLabel = document.createElement('span')
  nextStopLabel.className = 'live-bus-popup-label'
  nextStopLabel.textContent = 'Next stop'
  const button = nextStop && onSelectStop ? document.createElement('button') : null
  const nextStopName = document.createElement('strong')
  nextStopName.className = 'live-bus-popup-next-name'
  nextStopName.textContent = nextStop?.longName ?? 'Unavailable'
  nextStopDetail.append(nextStopLabel)
  element.append(nextStopDetail)

  const handleSelectStop = nextStop && onSelectStop
    ? () => onSelectStop(nextStop.id)
    : null
  if (button && nextStop) {
    button.type = 'button'
    button.className = 'live-bus-popup-stop-action'
    button.dataset.hoverFilter = 'none'
    button.setAttribute('aria-label', `View details for ${nextStop.longName} bus stop`)
    const chevron = document.createElement('span')
    chevron.className = 'live-bus-popup-chevron'
    chevron.setAttribute('aria-hidden', 'true')
    chevron.textContent = '›'
    button.append(nextStopName, chevron)
    if (handleSelectStop) button.addEventListener('click', handleSelectStop)
    nextStopDetail.append(button)
  } else {
    nextStopDetail.append(nextStopName)
  }

  return {
    element,
    dispose() {
      closeButton.removeEventListener('click', onClose)
      if (button && handleSelectStop) button.removeEventListener('click', handleSelectStop)
    },
  }
}

function createMarkerElement(
  vehicle: ShuttleVehiclePosition,
  routeName: string,
  nextStop: TransitStop | null,
  routeColor: string | undefined,
  mapBearing: number,
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
  const body = document.createElement('span')
  body.className = 'live-bus-marker-body'
  body.setAttribute('aria-hidden', 'true')
  body.innerHTML = renderToStaticMarkup(createElement(LiveBusVehicle))
  heading.append(body)
  const badge = document.createElement('span')
  badge.className = 'live-bus-marker-route'
  badge.setAttribute('aria-hidden', 'true')
  badge.textContent = vehicle.routeId
  element.append(badge)
  updateMarkerRouteColor(element, routeColor)
  updateMarkerHeading(element, vehicle.headingDegrees, mapBearing)
  updateMarkerLabel(element, routeName, vehicle, nextStop)
  return element
}

function updateMarkerRouteColor(element: HTMLElement, routeColor: string | undefined): void {
  if (routeColor) {
    element.style.setProperty('--live-bus-route-color', routeColor)
    element.style.setProperty('--live-bus-route-text', getRouteContrastTextColor(routeColor))
  } else {
    element.style.removeProperty('--live-bus-route-color')
    element.style.removeProperty('--live-bus-route-text')
  }
}

function updateMarkerHeading(element: HTMLElement, headingDegrees: number, mapBearing: number): void {
  const heading = element.querySelector<HTMLElement>('.live-bus-marker-heading')
  if (heading) heading.style.transform = `rotateX(45deg) rotateZ(${headingDegrees - mapBearing}deg)`
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

  // Rotate only the arrow; the bus and route badge stay readable in screen space.
  const updateHeadings = (): void => {
    const mapBearing = map.getBearing()
    for (const record of records.values()) {
      updateMarkerHeading(record.element, record.vehicle.headingDegrees, mapBearing)
    }
  }
  map.on('rotate', updateHeadings)

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
    const route = transitData?.index.routeById.get(vehicle.routeId)
    const routeName = route?.name ?? vehicle.routeId
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
    updateMarkerRouteColor(record.element, route?.color)
    updateMarkerHeading(record.element, vehicle.headingDegrees, map.getBearing())
    updateMarkerLabel(record.element, routeName, vehicle, nextStop)
    record.popupContent.dispose()
    record.popupContent = createLiveBusPopupContent(routeName, vehicle, nextStop, route?.color, () => record.popup.remove(), onSelectStop)
    record.popup.setDOMContent(record.popupContent.element)

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
      const route = transitData?.index.routeById.get(vehicle.routeId)
      const routeName = route?.name ?? vehicle.routeId
      const nextStop = getNextStop(
        vehicle,
        routePosition?.progressMeters ?? null,
        routeCoordinates,
        transitData,
      )
      const element = createMarkerElement(vehicle, routeName, nextStop, route?.color, map.getBearing())
      const popup = new Popup({
        className: 'live-bus-popup',
        closeButton: false,
        offset: 18,
        maxWidth: 'none',
      })
      const popupContent = createLiveBusPopupContent(routeName, vehicle, nextStop, route?.color, () => popup.remove(), onSelectStop)
      popup.setDOMContent(popupContent.element)
      const unregisterPopup = popupCoordinator.register(popup)
      const record: LiveBusMarkerRecord = {
        marker: new Marker({ element, anchor: 'center', rotationAlignment: 'viewport', pitchAlignment: 'viewport' })
          .setLngLat(routePosition ? toMutableCoordinate(routePosition.coordinate) : [vehicle.lng, vehicle.lat])
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
      map.off('rotate', updateHeadings)
      clearRecords()
      popupCoordinator.dispose()
    },
  }
}

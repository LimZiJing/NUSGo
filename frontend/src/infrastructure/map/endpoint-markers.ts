import { Marker, Popup, type Map } from 'maplibre-gl'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { TransitIndex } from '../../domain/transit'
import type { TripRequest } from '../../domain/trip/types'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import { getTripEndpointCoordinate } from '../../domain/trip/endpoint-location'
import type { BuildingIndex } from '../../domain/venue/building-index'
import { createMapPin, MAP_PIN_ANCHOR } from './map-pin'
import { createPopupContent } from './popup'

export interface TripEndpointMarkers {
  dispose(): void
}

export interface TripEndpointMarkerOptions {
  /**
   * Omits the origin circle because the visible Current location dot already marks that exact
   * spot. Presentation only: the endpoint and the Path keep their own coordinates.
   */
  readonly hideOrigin?: boolean
}

export function getTripEndpointMarkerClass(role: 'origin' | 'destination'): string {
  return `trip-endpoint-marker trip-endpoint-marker-${role}`
}

/**
 * The origin is a plain grey circle rather than a pin, so it never competes with the blue Current
 * location dot it may sit under. The destination is a member of the shared pin family with a dark
 * centre, which is what makes it the one red marker on the map. Neither carries an A/B label; the
 * accessible name keeps the role and the endpoint's own label.
 */
function createTripEndpointMarkerElement(
  role: 'origin' | 'destination',
  label: string,
): HTMLElement {
  const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
  if (role === 'destination') {
    const { element } = createMapPin({ variant: 'destination', label: `${roleLabel}: ${label}` })
    element.className = `${element.className} ${getTripEndpointMarkerClass(role)}`
    return element
  }

  const element = document.createElement('div')
  element.className = getTripEndpointMarkerClass(role)
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', `${roleLabel}: ${label}`)
  return element
}

function getTripEndpointMarkerAnchor(role: 'origin' | 'destination'): 'center' | 'bottom' {
  // A circle has no tip, so it covers the coordinate; a pin puts its point on it.
  return role === 'origin' ? 'center' : MAP_PIN_ANCHOR
}

export function createTripEndpointMarkers(
  map: Map,
  request: TripRequest,
  venues: VenueLocationMap,
  transitIndex: TransitIndex | null,
  buildings: BuildingIndex | null = null,
  options: TripEndpointMarkerOptions = {},
): TripEndpointMarkers {
  const markers: Array<{ marker: Marker; popup: Popup; popupContent: ReturnType<typeof createPopupContent> }> = []

  for (const [role, endpoint] of [
    ['origin', request.origin],
    ['destination', request.destination],
  ] as const) {
    if (!endpoint) continue
    if (role === 'origin' && options.hideOrigin) continue

    const resolved = getTripEndpointCoordinate(endpoint, { venues, buildings, transitIndex })
    if (!resolved) continue
    const coordinate: [number, number] = [resolved.longitude, resolved.latitude]

    const label = getTripEndpointLabel(endpoint, venues, transitIndex, buildings ?? undefined)
    const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
    const details = endpoint.kind === 'current-location' || endpoint.kind === 'personal-waypoint'
      ? [label]
      : [label, `ID: ${endpoint.id}`]
    const popupContent = createPopupContent(roleLabel, details)
    // A destination pin is taller than the circle, so its popup clears the pin head.
    const popup = new Popup({ offset: role === 'origin' ? 24 : 40 }).setDOMContent(popupContent.element)
    const marker = new Marker({
      anchor: getTripEndpointMarkerAnchor(role),
      element: createTripEndpointMarkerElement(role, label),
    })
      .setLngLat(coordinate)
      .setPopup(popup)
      .addTo(map)

    markers.push({ marker, popup, popupContent })
  }

  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      for (const { marker, popup, popupContent } of markers) {
        marker.remove()
        popup.remove()
        popupContent.dispose()
      }
      markers.length = 0
    },
  }
}

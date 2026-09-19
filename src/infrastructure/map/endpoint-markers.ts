import { Marker, Popup, type Map } from 'maplibre-gl'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { TransitIndex } from '../../domain/transit'
import type { TripEndpoint, TripRequest } from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'
import { createPopupContent } from './popup'

export interface TripEndpointMarkers {
  dispose(): void
}

export function getTripEndpointMarkerClass(role: 'origin' | 'destination'): string {
  return `trip-endpoint-marker trip-endpoint-marker-${role}`
}

function createTripEndpointMarkerElement(
  role: 'origin' | 'destination',
  label: string,
): HTMLDivElement {
  const element = document.createElement('div')
  const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
  element.className = getTripEndpointMarkerClass(role)
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', `${roleLabel}: ${label}`)
  return element
}

function getTripEndpointCoordinate(
  endpoint: TripEndpoint,
  venues: VenueLocationMap,
  transitIndex: TransitIndex | null,
): [number, number] | null {
  if (endpoint.kind === 'venue') {
    const location = venues[endpoint.id]?.location
    return location && Number.isFinite(location.x) && Number.isFinite(location.y)
      ? [location.x, location.y]
      : null
  }

  const stop = transitIndex?.stopById.get(endpoint.id)
  return stop && Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
    ? [stop.longitude, stop.latitude]
    : null
}

export function createTripEndpointMarkers(
  map: Map,
  request: TripRequest,
  venues: VenueLocationMap,
  transitIndex: TransitIndex | null,
): TripEndpointMarkers {
  const markers: Array<{ marker: Marker; popup: Popup; popupContent: ReturnType<typeof createPopupContent> }> = []

  for (const [role, endpoint] of [
    ['origin', request.origin],
    ['destination', request.destination],
  ] as const) {
    if (!endpoint) continue

    const coordinate = getTripEndpointCoordinate(endpoint, venues, transitIndex)
    if (!coordinate) continue

    const label = getTripEndpointLabel(endpoint, venues, transitIndex)
    const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
    const popupContent = createPopupContent(roleLabel, [label, `ID: ${endpoint.id}`])
    const popup = new Popup({ offset: 24 }).setDOMContent(popupContent.element)
    const marker = new Marker({
      anchor: 'center',
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

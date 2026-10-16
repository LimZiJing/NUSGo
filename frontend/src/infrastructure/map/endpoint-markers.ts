import { Marker, Popup, type Map } from 'maplibre-gl'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { TransitIndex } from '../../domain/transit'
import type { TripRequest } from '../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { getTripEndpointCoordinate } from '../../domain/trip/endpoint-location'
import type { BuildingIndex } from '../../domain/venue/building-index'
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

export function createTripEndpointMarkers(
  map: Map,
  request: TripRequest,
  venues: VenueLocationMap,
  transitIndex: TransitIndex | null,
  buildings: BuildingIndex | null = null,
): TripEndpointMarkers {
  const markers: Array<{ marker: Marker; popup: Popup; popupContent: ReturnType<typeof createPopupContent> }> = []

  for (const [role, endpoint] of [
    ['origin', request.origin],
    ['destination', request.destination],
  ] as const) {
    if (!endpoint) continue

    const resolved = getTripEndpointCoordinate(endpoint, { venues, buildings, transitIndex })
    if (!resolved) continue
    const coordinate: [number, number] = [resolved.longitude, resolved.latitude]

    const label = getTripEndpointLabel(endpoint, venues, transitIndex, buildings ?? undefined)
    const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
    const details = endpoint.kind === 'current-location'
      ? [label]
      : [label, `ID: ${endpoint.id}`]
    const popupContent = createPopupContent(roleLabel, details)
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

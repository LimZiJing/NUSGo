import { Map, Marker, Popup } from 'maplibre-gl'
import type { TransitStop } from '../types/transit'
import type { VenueLocation, VenueLocationMap } from '../types/venues'

function createPopupContent(titleText: string, details: string[]): HTMLDivElement {
  // Use text nodes instead of setHTML so values from external datasets remain text.
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = titleText
  content.append(title)

  for (const detail of details) {
    const line = document.createElement('div')
    line.textContent = detail
    content.append(line)
  }

  return content
}

export function addVenueMarker(
  map: Map,
  venueCode: string,
  venue: VenueLocation,
): Marker | null {
  if (!venue.location) return null

  const details = [venue.roomName]
  if (venue.floor !== undefined && venue.floor !== null) {
    details.push(`Floor: ${venue.floor}`)
  }

  return new Marker({ color: '#d94f70' })
    // Venue data stores x/y as longitude/latitude.
    .setLngLat([venue.location.x, venue.location.y])
    .setPopup(new Popup({ offset: 24 }).setDOMContent(createPopupContent(venueCode, details)))
    .addTo(map)
}

export function getVenueCount(venues: VenueLocationMap): number {
  return Object.values(venues).filter((venue) => venue.location).length
}

export function createBusStopPopupCoordinator() {
  let activePopup: Popup | null = null

  return {
    register(popup: Popup): void {
      popup.on('open', () => {
        const previousPopup = activePopup
        activePopup = popup
        if (previousPopup && previousPopup !== popup) previousPopup.remove()
      })
      popup.on('close', () => {
        if (activePopup === popup) activePopup = null
      })
    },
  }
}

function createBusStopMarkerElement(stop: TransitStop): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'bus-stop-marker'
  element.setAttribute('role', 'button')
  element.setAttribute('aria-label', `${stop.longName} shuttle stop`)
  return element
}

export function addBusStopMarkers(map: Map, busStops: TransitStop[]): Marker[] {
  const markers: Marker[] = []
  const popupCoordinator = createBusStopPopupCoordinator()

  for (const stop of busStops) {
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) continue

    const details = [
      `Stop: ${stop.id}`,
      `Services: ${stop.services.join(', ')}`,
    ]
    if (stop.opposite) details.push(`Opposite stop: ${stop.opposite}`)

    const marker = new Marker({
      anchor: 'center',
      element: createBusStopMarkerElement(stop),
    })
    const element = marker.getElement()
    element.dataset.stopId = stop.id
    const popup = new Popup({ offset: 24 })
      .setDOMContent(createPopupContent(stop.longName, details))
    popupCoordinator.register(popup)
    marker
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(popup)
      .addTo(map)

    markers.push(marker)
  }

  return markers
}

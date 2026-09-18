import { Map, Marker, Popup } from 'maplibre-gl'
import { getTripEndpointLabel } from '../location/search'
import type { TransitStop } from '../types/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../types/trip'
import type { VenueLocation, VenueLocationMap } from '../types/venues'

interface PopupAction {
  label: string
  onClick: () => void
}

function createPopupContent(
  titleText: string,
  details: string[],
  actions: PopupAction[] = [],
): HTMLDivElement {
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

  for (const action of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = action.label
    button.className = 'bus-stop-popup-action'
    button.addEventListener('click', action.onClick)
    content.append(button)
  }

  return content
}

export function addVenueMarker(
  map: Map,
  venue: VenueLocation,
): Marker | null {
  if (!venue.location) return null

  // The contextual panel is the canonical venue detail surface, so this marker
  // deliberately has no popup that could duplicate the panel.
  return new Marker({ color: '#d94f70' })
    // Venue data stores x/y as longitude/latitude.
    .setLngLat([venue.location.x, venue.location.y])
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

export function createBusStopPopupContent(
  stop: TransitStop,
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
): HTMLDivElement {
  const details = [
    `Stop: ${stop.id}`,
    `Services: ${stop.services.join(', ')}`,
  ]
  if (stop.opposite) details.push(`Opposite stop: ${stop.opposite}`)

  const actions = onSetEndpoint
    ? (['origin', 'destination'] as const).map((role) => ({
        label: role === 'origin' ? 'Set as origin' : 'Set as destination',
        onClick: () => onSetEndpoint(role, { kind: 'stop', id: stop.id }),
      }))
    : []

  return createPopupContent(stop.longName, details, actions)
}

export function addBusStopMarkers(
  map: Map,
  busStops: TransitStop[],
  onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
): Marker[] {
  const markers: Marker[] = []
  const popupCoordinator = createBusStopPopupCoordinator()

  for (const stop of busStops) {
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) continue

    const marker = new Marker({
      anchor: 'center',
      element: createBusStopMarkerElement(stop),
    })
    const element = marker.getElement()
    element.dataset.stopId = stop.id
    const popup = new Popup({ offset: 24 })
      .setDOMContent(createBusStopPopupContent(stop, onSetEndpoint))
    popupCoordinator.register(popup)
    marker
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(popup)
      .addTo(map)

    markers.push(marker)
  }

  return markers
}

export function getTripEndpointMarkerClass(role: TripEndpointRole): string {
  return `trip-endpoint-marker trip-endpoint-marker-${role}`
}

function createTripEndpointMarkerElement(
  role: TripEndpointRole,
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
  stops: TransitStop[],
): [number, number] | null {
  if (endpoint.kind === 'venue') {
    const location = venues[endpoint.id]?.location
    return location && Number.isFinite(location.x) && Number.isFinite(location.y)
      ? [location.x, location.y]
      : null
  }

  const stop = stops.find((candidate) => candidate.id === endpoint.id)
  return stop && Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
    ? [stop.longitude, stop.latitude]
    : null
}

export function addTripEndpointMarkers(
  map: Map,
  request: TripRequest,
  venues: VenueLocationMap,
  stops: TransitStop[],
): Marker[] {
  const markers: Marker[] = []

  for (const [role, endpoint] of [
    ['origin', request.origin],
    ['destination', request.destination],
  ] as const) {
    if (!endpoint) continue

    const coordinate = getTripEndpointCoordinate(endpoint, venues, stops)
    if (!coordinate) continue

    const label = getTripEndpointLabel(endpoint, venues, stops)
    const roleLabel = role === 'origin' ? 'Origin' : 'Destination'
    const marker = new Marker({
      anchor: 'center',
      element: createTripEndpointMarkerElement(role, label),
    })
      .setLngLat(coordinate)
      .setPopup(new Popup({ offset: 24 }).setDOMContent(
        createPopupContent(roleLabel, [label, `ID: ${endpoint.id}`]),
      ))
      .addTo(map)

    markers.push(marker)
  }

  return markers
}

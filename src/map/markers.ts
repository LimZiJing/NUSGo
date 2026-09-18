import {
  Map,
  Marker,
  Popup,
  type FilterSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import type { TransitStop } from '../types/transit'
import type { VenueLocation, VenueLocationMap } from '../types/venues'

export const BUS_STOP_MIN_ZOOM = 14
export const BUS_STOP_LABEL_SOURCE_ID = 'shuttle-stop-labels'
export const BUS_STOP_LABEL_LAYER_ID = 'shuttle-stop-labels'

const BUS_STOP_LABEL_LAYER: SymbolLayerSpecification = {
  id: BUS_STOP_LABEL_LAYER_ID,
  type: 'symbol',
  source: BUS_STOP_LABEL_SOURCE_ID,
  layout: {
    'text-anchor': 'top',
    'text-field': ['get', 'shortName'],
    'text-font': ['Open Sans Regular'],
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
  },
  minzoom: BUS_STOP_MIN_ZOOM,
  paint: {
    'text-color': '#334155',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1,
  },
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

export function createBusStopLabelGeoJson(stops: TransitStop[]): BusStopLabelGeoJson {
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

  return new Marker({ color: '#64748b' })
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

function createBusStopMarkerElement(stop: TransitStop): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'bus-stop-marker'
  element.setAttribute('aria-label', `${stop.longName} shuttle stop`)
  return element
}

type BusStopMarkerState = {
  map: Map
  markers: Marker[]
  selectedStopIds: ReadonlySet<string> | null
  focusedStopIds: Set<string>
  handleZoom: () => void
}

const busStopMarkerStates = new WeakMap<Marker[], BusStopMarkerState>()

function getBusStopLabelFilter(
  selectedStopIds: ReadonlySet<string> | null,
  focusedStopIds: ReadonlySet<string>,
): FilterSpecification | null {
  if (selectedStopIds === null && focusedStopIds.size === 0) return null

  const visibleStopIds = new Set(selectedStopIds ?? [])
  for (const stopId of focusedStopIds) visibleStopIds.add(stopId)

  return [
    'in',
    ['get', 'stopId'],
    ['literal', Array.from(visibleStopIds)],
  ]
}

function updateBusStopMarkerElement(
  marker: Marker,
  isSelected: boolean,
  isVisible: boolean,
): void {
  const element = marker.getElement()
  element.classList.toggle('bus-stop-marker-selected', isSelected)
  element.classList.toggle('bus-stop-marker-hidden', !isVisible)
  element.style.display = isVisible ? '' : 'none'

  const popup = marker.getPopup()
  if (!isVisible && popup?.isOpen()) popup.remove()
}

function updateBusStopMarkerPresentation(state: BusStopMarkerState): void {
  const zoom = state.map.getZoom()
  const selectedStopIds = state.selectedStopIds
  const selectedIds = selectedStopIds ?? new Set<string>()

  for (const marker of state.markers) {
    const element = marker.getElement()
    const stopId = element.dataset.stopId ?? ''
    const isSelected = selectedIds.has(stopId)
    const isFocused = state.focusedStopIds.has(stopId)
    const isVisible = isBusStopVisible(zoom, selectedStopIds !== null && isSelected, isFocused)
    updateBusStopMarkerElement(marker, isSelected, isVisible)
  }

  if (state.map.getLayer(BUS_STOP_LABEL_LAYER_ID)) {
    state.map.setFilter(
      BUS_STOP_LABEL_LAYER_ID,
      getBusStopLabelFilter(selectedStopIds, state.focusedStopIds),
    )
    state.map.setLayerZoomRange(
      BUS_STOP_LABEL_LAYER_ID,
      selectedStopIds !== null || state.focusedStopIds.size > 0 ? 0 : BUS_STOP_MIN_ZOOM,
      24,
    )
  }
}

export function addBusStopMarkers(map: Map, busStops: TransitStop[]): Marker[] {
  const markers: Marker[] = []
  const popupCoordinator = createBusStopPopupCoordinator()
  const state: BusStopMarkerState = {
    map,
    markers,
    selectedStopIds: null,
    focusedStopIds: new Set<string>(),
    handleZoom: () => updateBusStopMarkerPresentation(state),
  }

  if (!map.getSource(BUS_STOP_LABEL_SOURCE_ID)) {
    map.addSource(BUS_STOP_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: createBusStopLabelGeoJson(busStops),
    })
  }
  if (!map.getLayer(BUS_STOP_LABEL_LAYER_ID)) {
    map.addLayer(BUS_STOP_LABEL_LAYER)
  }

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
    popup.on('open', () => {
      state.focusedStopIds.add(stop.id)
      updateBusStopMarkerPresentation(state)
    })
    popup.on('close', () => {
      state.focusedStopIds.delete(stop.id)
      updateBusStopMarkerPresentation(state)
    })
    marker
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(popup)
      .addTo(map)

    markers.push(marker)
  }

  busStopMarkerStates.set(markers, state)
  map.on('zoom', state.handleZoom)
  updateBusStopMarkerPresentation(state)

  return markers
}

export function removeBusStopMarkers(map: Map, markers: Marker[]): void {
  const state = busStopMarkerStates.get(markers)
  if (!state) return

  map.off('zoom', state.handleZoom)
  if (map.getLayer(BUS_STOP_LABEL_LAYER_ID)) {
    map.removeLayer(BUS_STOP_LABEL_LAYER_ID)
  }
  if (map.getSource(BUS_STOP_LABEL_SOURCE_ID)) {
    map.removeSource(BUS_STOP_LABEL_SOURCE_ID)
  }
  busStopMarkerStates.delete(markers)
}

export function setBusStopMarkerSelection(
  markers: Marker[],
  selectedStopIds: readonly string[] | null,
): void {
  const state = busStopMarkerStates.get(markers)
  if (!state) {
    const selectedIds = new Set(selectedStopIds ?? [])
    for (const marker of markers) {
      const element = marker.getElement()
      const isSelected = selectedIds.has(element.dataset.stopId ?? '')
      updateBusStopMarkerElement(
        marker,
        selectedStopIds !== null && isSelected,
        selectedStopIds === null || isSelected,
      )
    }
    return
  }

  state.selectedStopIds = selectedStopIds === null ? null : new Set(selectedStopIds)
  updateBusStopMarkerPresentation(state)
}

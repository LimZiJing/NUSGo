import type {
  LoadedTransitData,
  MapRouteSelection,
  MapSession,
} from '../../app/contracts/map'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../domain/trip/types'
import type { VenueLocation } from '../../domain/venue/types'
import { applyBasemapPresentation } from './basemap'
import { createTripEndpointMarkers, type TripEndpointMarkers } from './endpoint-markers'
import { createMapLifecycle } from './lifecycle'
import { createShuttleStopMarkers, type ShuttleStopMarkers } from './shuttle-stops'
import { createTransitRouteLayers, type TransitRouteLayers } from './transit'
import { createVenueMarker, type VenueMarker } from './venue-markers'
import type { TransitIndex } from '../../domain/transit'
import type { VenueLocationMap } from '../../domain/venue/types'

export interface MapSessionOptions {
  readonly container: HTMLElement
  readonly onMapError: (error: unknown) => void
  readonly onEmptyMapClick: () => void
}

export function createMapSession(options: MapSessionOptions): MapSession {
  const lifecycle = createMapLifecycle(options)
  const map = lifecycle.map
  let selectedVenueMarker: VenueMarker | null = null
  let endpointMarkers: TripEndpointMarkers | null = null
  let shuttleStopMarkers: ShuttleStopMarkers | null = null
  let transitRouteLayers: TransitRouteLayers | null = null
  let transitData: LoadedTransitData | null = null
  let currentTripRequest: TripRequest | null = null
  let currentVenues: VenueLocationMap = {}
  let currentTransitIndex: TransitIndex | null = null
  let selectedRouteId: string | null = null
  let disposed = false

  const ready = lifecycle.ready.then(() => {
    if (!disposed) applyBasemapPresentation(map)
  })
  // The application observes `ready`; this handler also prevents an unobserved
  // style-load rejection when a session is disposed before consumers await it.
  void ready.catch(() => undefined)

  const clearVenueMarker = () => {
    selectedVenueMarker?.dispose()
    selectedVenueMarker = null
  }

  const clearEndpointMarkers = () => {
    endpointMarkers?.dispose()
    endpointMarkers = null
  }

  const clearTransitData = () => {
    shuttleStopMarkers?.dispose()
    shuttleStopMarkers = null
    transitRouteLayers?.dispose()
    transitRouteLayers = null
    transitData = null
    selectedRouteId = null
  }

  return {
    ready,

    loadTransitData(
      data: LoadedTransitData,
      onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
    ) {
      if (disposed) return 0

      clearTransitData()
      transitData = data
      transitRouteLayers = createTransitRouteLayers(map, data.geometry)
      shuttleStopMarkers = createShuttleStopMarkers(map, data.index.stops, onSetEndpoint)
      currentTransitIndex = data.index
      clearEndpointMarkers()
      if (currentTripRequest) {
        endpointMarkers = createTripEndpointMarkers(
          map,
          currentTripRequest,
          currentVenues,
          currentTransitIndex,
        )
      }
      return shuttleStopMarkers.markers.length
    },

    setRouteSelection(selection: MapRouteSelection) {
      if (disposed) return

      const nextRouteId = selection.route?.id ?? null
      const routeChanged = nextRouteId !== selectedRouteId
      selectedRouteId = nextRouteId
      transitRouteLayers?.setSelection(nextRouteId, selection.overlappingRouteIds)
      shuttleStopMarkers?.setSelection(
        selection.route?.stopIds ?? null,
        selection.route?.color ?? null,
      )

      if (routeChanged && transitData) {
        transitRouteLayers?.fitRoute(
          transitData.index,
          transitData.geometry,
          nextRouteId,
        )
      }
    },

    setTripRequest(request: TripRequest, venues: VenueLocationMap, transitIndex: TransitIndex | null) {
      if (disposed) return

      currentTripRequest = request
      currentVenues = venues
      currentTransitIndex = transitIndex
      clearEndpointMarkers()
      endpointMarkers = createTripEndpointMarkers(map, request, venues, transitIndex)
    },

    selectVenue(venue: VenueLocation) {
      if (disposed) return

      clearVenueMarker()
      const marker = createVenueMarker(map, venue)
      if (!marker || !venue.location) return

      selectedVenueMarker = marker
      map.flyTo({
        center: [venue.location.x, venue.location.y],
        zoom: Math.max(map.getZoom(), 17),
        essential: true,
      })
    },

    clearVenue() {
      clearVenueMarker()
    },

    dispose() {
      if (disposed) return
      disposed = true
      clearVenueMarker()
      clearEndpointMarkers()
      clearTransitData()
      lifecycle.dispose()
    },
  }
}

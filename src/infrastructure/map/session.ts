import type { LoadedTransitData } from '../../app/contracts/data'
import type {
  MapRouteSelection,
  MapSession,
  MapSessionOptions,
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

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

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
  let currentRouteSelection: MapRouteSelection = {
    route: null,
    overlappingRouteIds: EMPTY_ROUTE_OVERLAP,
  }
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
  }

  const reconcileRouteSelection = (selection: MapRouteSelection): MapRouteSelection => {
    const routeId = selection.route?.id
    const route = routeId && currentTransitIndex
      ? currentTransitIndex.routeById.get(routeId) ?? null
      : null
    if (!route) {
      return { route: null, overlappingRouteIds: EMPTY_ROUTE_OVERLAP }
    }

    const overlappingRouteIds = new Set<string>()
    for (const overlappingRouteId of selection.overlappingRouteIds) {
      if (currentTransitIndex?.routeById.has(overlappingRouteId)) {
        overlappingRouteIds.add(overlappingRouteId)
      }
    }
    return { route, overlappingRouteIds }
  }

  const applyRouteSelection = (selection: MapRouteSelection) => {
    transitRouteLayers?.setSelection(
      selection.route?.id ?? null,
      selection.overlappingRouteIds,
    )
    shuttleStopMarkers?.setSelection(
      selection.route?.stopIds ?? null,
      selection.route?.color ?? null,
    )
  }

  return {
    ready,

    loadTransitData(
      data: LoadedTransitData,
      selection: MapRouteSelection,
      onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
    ) {
      if (disposed) return

      const previousRouteId = currentRouteSelection.route?.id ?? null
      clearTransitData()
      transitData = data
      currentTransitIndex = data.index
      transitRouteLayers = createTransitRouteLayers(map, data.geometry)
      shuttleStopMarkers = createShuttleStopMarkers(map, data.index.stops, onSetEndpoint)
      currentRouteSelection = reconcileRouteSelection(selection)
      applyRouteSelection(currentRouteSelection)
      clearEndpointMarkers()
      if (currentTripRequest) {
        endpointMarkers = createTripEndpointMarkers(
          map,
          currentTripRequest,
          currentVenues,
          currentTransitIndex,
        )
      }
      const nextRouteId = currentRouteSelection.route?.id ?? null
      if (nextRouteId !== previousRouteId) {
        transitRouteLayers.fitRoute(
          data.index,
          data.geometry,
          nextRouteId,
        )
      }
    },

    setRouteSelection(selection: MapRouteSelection) {
      if (disposed) return

      const previousRouteId = currentRouteSelection.route?.id ?? null
      currentRouteSelection = currentTransitIndex
        ? reconcileRouteSelection(selection)
        : {
            route: selection.route,
            overlappingRouteIds: new Set(selection.overlappingRouteIds),
          }
      const nextRouteId = currentRouteSelection.route?.id ?? null
      applyRouteSelection(currentRouteSelection)

      if (nextRouteId !== previousRouteId && transitData) {
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

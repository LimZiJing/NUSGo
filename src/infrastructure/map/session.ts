import type { LoadedTransitData } from '../../app/contracts/data'
import type {
  MapRouteSelection,
  MapSession,
  MapSessionOptions,
  MapResetTarget,
  MapViewportInsets,
} from '../../app/contracts/map'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../domain/trip/types'
import type { Journey } from '../../domain/trip/journey'
import type { VenueLocation } from '../../domain/venue/types'
import { applyBasemapPresentation } from './basemap'
import { createTripEndpointMarkers, type TripEndpointMarkers } from './endpoint-markers'
import { createMapLifecycle } from './lifecycle'
import { createShuttleStopMarkers, type ShuttleStopMarkers } from './shuttle-stops'
import { createTransitRouteLayers, type TransitRouteLayers } from './transit'
import { createVenueMarker, type VenueMarker } from './venue-markers'
import { createJourneyRouteLayers, type JourneyRouteLayers } from './journey'
import type { TransitIndex } from '../../domain/transit'
import type { VenueLocationMap } from '../../domain/venue/types'

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()
const EMPTY_VIEWPORT_INSETS: MapViewportInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

export function createMapSession(options: MapSessionOptions): MapSession {
  const lifecycle = createMapLifecycle(options)
  const map = lifecycle.map
  let selectedVenueMarker: VenueMarker | null = null
  let endpointMarkers: TripEndpointMarkers | null = null
  let shuttleStopMarkers: ShuttleStopMarkers | null = null
  let transitRouteLayers: TransitRouteLayers | null = null
  let journeyRouteLayers: JourneyRouteLayers | null = null
  let currentJourney: Journey | null = null
  let transitData: LoadedTransitData | null = null
  let currentTripRequest: TripRequest | null = null
  let currentVenues: VenueLocationMap = {}
  let currentTransitIndex: TransitIndex | null = null
  let viewportInsets: MapViewportInsets = EMPTY_VIEWPORT_INSETS
  let pendingCameraFit: {
    readonly kind: 'venue'
    readonly venue: VenueLocation
  } | {
    readonly kind: 'route'
    readonly routeId: string | null
  } | null = null
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
    if (pendingCameraFit?.kind === 'venue') pendingCameraFit = null
  }

  const getFitPadding = (): MapViewportInsets => viewportInsets

  const fitVenue = (venue: VenueLocation): void => {
    const location = venue.location
    if (!location) return
    map.flyTo({
      center: [location.x, location.y],
      zoom: 17,
      duration: 500,
      padding: getFitPadding(),
      essential: true,
    })
  }

  const fitTripEndpoints = (coordinates: readonly (readonly [number, number])[]): void => {
    if (coordinates.length === 0) return
    if (coordinates.length === 1) {
      map.flyTo({
        center: [coordinates[0][0], coordinates[0][1]],
        zoom: 17,
        duration: 500,
        padding: getFitPadding(),
        essential: true,
      })
      return
    }
    const longitudes = coordinates.map(([longitude]) => longitude)
    const latitudes = coordinates.map(([, latitude]) => latitude)
    map.fitBounds([
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ], {
      duration: 500,
      maxZoom: 17,
      padding: getFitPadding(),
    })
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

  const clearJourneyRouteLayers = (): void => {
    journeyRouteLayers?.dispose()
    journeyRouteLayers = null
  }

  const installJourneyRouteLayers = (): void => {
    if (currentJourney === null || journeyRouteLayers) return
    const nextJourneyRouteLayers = createJourneyRouteLayers(map, currentTransitIndex)
    nextJourneyRouteLayers.setJourney(currentJourney)
    journeyRouteLayers = nextJourneyRouteLayers
  }

  const getJourneyStopIds = (): ReadonlySet<string> | null => {
    if (currentJourney === null) return null
    const stopIds = new Set<string>()
    if (!currentTransitIndex) return stopIds

    for (const leg of currentJourney.legs) {
      if (leg.mode !== 'shuttle') continue
      const route = currentTransitIndex.routeById.get(leg.routeId)
      for (const stopId of route?.stopIds ?? []) stopIds.add(stopId)
    }
    return stopIds
  }

  const applyJourneyPresentation = (): void => {
    const journeyActive = currentJourney !== null
    transitRouteLayers?.setJourneyActive(journeyActive)
    shuttleStopMarkers?.setJourneyStops(getJourneyStopIds())
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
      clearJourneyRouteLayers()
      clearTransitData()
      transitData = data
      currentTransitIndex = data.index
      transitRouteLayers = createTransitRouteLayers(map, data.geometry)
      shuttleStopMarkers = createShuttleStopMarkers(map, data.index.stops, onSetEndpoint)
      currentRouteSelection = reconcileRouteSelection(selection)
      applyRouteSelection(currentRouteSelection)
      applyJourneyPresentation()
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
        pendingCameraFit = { kind: 'route', routeId: nextRouteId }
      }
      installJourneyRouteLayers()
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

      if (nextRouteId !== previousRouteId && transitData && currentJourney === null) {
        pendingCameraFit = { kind: 'route', routeId: nextRouteId }
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

    setJourney(journey: Journey | null) {
      if (disposed) return
      currentJourney = journey
      if (journey !== null && pendingCameraFit?.kind === 'route') pendingCameraFit = null
      clearJourneyRouteLayers()
      try {
        applyJourneyPresentation()
        installJourneyRouteLayers()
      } catch (error) {
        currentJourney = null
        clearJourneyRouteLayers()
        applyJourneyPresentation()
        options.onMapError(error)
      }
    },

    setViewportInsets(insets: MapViewportInsets) {
      if (disposed) return
      viewportInsets = { ...insets }
      const pendingFit = pendingCameraFit
      pendingCameraFit = null
      if (pendingFit?.kind === 'venue') {
        fitVenue(pendingFit.venue)
      } else if (pendingFit?.kind === 'route' && transitData) {
        transitRouteLayers?.fitRoute(
          transitData.index,
          transitData.geometry,
          pendingFit.routeId,
          viewportInsets,
        )
      }
    },

    dismissPopup() {
      if (disposed) return false
      const closeButton = map.getContainer().querySelector<HTMLButtonElement>(
        '.maplibregl-popup-close-button',
      )
      if (!closeButton) return false
      closeButton.click()
      return true
    },

    zoomIn() {
      if (disposed) return
      map.zoomIn({ duration: 200 })
    },

    zoomOut() {
      if (disposed) return
      map.zoomOut({ duration: 200 })
    },

    resetView(target: MapResetTarget) {
      if (disposed) return
      pendingCameraFit = null
      if (target.kind === 'venue' || target.kind === 'campus') {
        map.flyTo({
          center: [target.center[0], target.center[1]],
          zoom: target.zoom,
          duration: 500,
          padding: getFitPadding(),
          essential: true,
        })
        return
      }
      if (target.kind === 'trip') {
        fitTripEndpoints(target.coordinates)
        return
      }
      if (transitData) {
        transitRouteLayers?.fitRoute(
          transitData.index,
          transitData.geometry,
          target.routeId,
          viewportInsets,
        )
      }
    },

    selectVenue(venue: VenueLocation) {
      if (disposed) return

      clearVenueMarker()
      const marker = createVenueMarker(map, venue)
      if (!marker || !venue.location) return

      selectedVenueMarker = marker
      pendingCameraFit = { kind: 'venue', venue }
    },

    clearVenue() {
      clearVenueMarker()
    },

    dispose() {
      if (disposed) return
      disposed = true
      pendingCameraFit = null
      clearVenueMarker()
      clearEndpointMarkers()
      clearTransitData()
      currentJourney = null
      clearJourneyRouteLayers()
      lifecycle.dispose()
    },
  }
}

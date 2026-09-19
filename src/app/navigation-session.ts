import { createTransitNetworkIndex, type TransitNetworkIndex } from '../domain/transit'
import { deriveTransitRouteOverlapMap } from '../domain/transit/overlap'
import { TransitValidationError } from '../domain/transit/validation'
import type { TransitNetwork } from '../domain/transit/types'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../domain/trip/endpoints'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'
import type { MapSession, TransitMapData, VenueData } from './contracts'
import type { VenueSearchResult } from '../domain/venue/search'

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

export interface NavigationSessionState {
  readonly venues: VenueLocationMap | null
  readonly transitNetwork: TransitNetwork | null
  readonly selectedRouteId: string | null
  readonly selectedRouteColor: string | null
  readonly tripRequest: TripRequest
  readonly status: string
}

export interface NavigationSessionDependencies {
  readonly map: MapSession
  readonly loadVenues: (signal: AbortSignal) => Promise<VenueData>
  readonly loadTransit: (signal: AbortSignal) => Promise<TransitMapData>
}

export interface NavigationSession {
  getState(): NavigationSessionState
  subscribe(listener: () => void): () => void
  start(signal: AbortSignal): Promise<void>
  selectRoute(routeId: string | null): void
  setTripEndpoint(role: TripEndpointRole, endpoint: TripEndpoint): void
  clearTripEndpoint(role: TripEndpointRole): void
  swapTripEndpoints(): void
  clearTrip(): void
  selectVenue(result: VenueSearchResult): void
  clearVenue(): void
  reportMapError(error: unknown): void
  dispose(): void
}

export function createInitialNavigationSessionState(): NavigationSessionState {
  return {
    venues: null,
    transitNetwork: null,
    selectedRouteId: null,
    selectedRouteColor: null,
    tripRequest: createEmptyTripRequest(),
    status: 'Loading map data…',
  }
}

export function createNavigationSession(
  dependencies: NavigationSessionDependencies,
): NavigationSession {
  let state = createInitialNavigationSessionState()
  let transitIndex: TransitNetworkIndex | null = null
  let routeOverlapMap: ReadonlyMap<string, ReadonlySet<string>> = new globalThis.Map()
  let disposed = false
  let started = false
  const listeners = new Set<() => void>()

  const publish = (nextState: NavigationSessionState) => {
    if (disposed) return
    state = nextState
    listeners.forEach((listener) => listener())
  }

  const updateState = (patch: Partial<NavigationSessionState>) => {
    publish({ ...state, ...patch })
  }

  const syncTripRequest = (request: TripRequest) => {
    dependencies.map.setTripRequest(
      request,
      state.venues ?? {},
      state.transitNetwork?.stops ?? [],
    )
  }

  const setRequest = (request: TripRequest) => {
    updateState({ tripRequest: request })
    syncTripRequest(request)
  }

  const isAborted = (error: unknown, signal: AbortSignal) =>
    signal.aborted ||
    (error instanceof DOMException && error.name === 'AbortError')

  const handleVenueLoad = (data: VenueData, transitLoaded: boolean) => {
    updateState({
      venues: data.venues,
      status: transitLoaded
        ? state.status
        : data.venueCount + ' venues available; loading shuttle routes…',
    })
    syncTripRequest(state.tripRequest)
  }

  const handleTransitLoad = (data: TransitMapData, venueCount: number) => {
    transitIndex = createTransitNetworkIndex(data.network)
    routeOverlapMap = deriveTransitRouteOverlapMap(data.geometry)
    const markerCount = dependencies.map.loadTransitData(
      data,
      (role, endpoint) => setRequest(setTripEndpoint(state.tripRequest, role, endpoint)),
    )
    updateState({
      transitNetwork: data.network,
      status: venueCount + ' venues · ' +
        markerCount + ' shuttle stops · ' +
        data.network.routes.length + ' shuttle routes loaded',
    })
    syncTripRequest(state.tripRequest)
  }

  const reportTransitFailure = (error: unknown) => {
    const message = error instanceof TransitValidationError
      ? 'Transit route data validation failed: ' + error.message
      : 'Unable to load shuttle route data'
    updateState({ status: message })
    console.error(error)
  }

  return {
    getState() {
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async start(signal) {
      if (started || disposed) return
      started = true

      let venueCount = 0
      let transitLoaded = false
      let transitFailure = false

      const venuesPromise = dependencies.loadVenues(signal)
        .then((data) => {
          venueCount = data.venueCount
          if (!disposed) handleVenueLoad(data, transitLoaded)
        })
        .catch((error: unknown) => {
          if (isAborted(error, signal) || disposed) return
          updateState({ status: 'Unable to load venue data' })
          console.error(error)
        })

      const transitPromise = dependencies.loadTransit(signal)
        .then(async (data) => {
          await dependencies.map.ready
          if (disposed || signal.aborted) return
          transitLoaded = true
          handleTransitLoad(data, venueCount)
        })
        .catch((error: unknown) => {
          if (isAborted(error, signal) || disposed) return
          transitFailure = true
          reportTransitFailure(error)
        })

      await Promise.all([venuesPromise, transitPromise])
      if (!transitFailure && !transitLoaded && signal.aborted) return
    },

    selectRoute(routeId) {
      const selectedRoute = routeId && transitIndex
        ? transitIndex.routeById.get(routeId)
        : undefined
      const nextRouteId = selectedRoute?.id ?? null
      updateState({
        selectedRouteId: nextRouteId,
        selectedRouteColor: selectedRoute?.color ?? null,
      })
      dependencies.map.setRouteSelection({
        route: selectedRoute ?? null,
        overlappingRouteIds: nextRouteId
          ? routeOverlapMap.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
          : EMPTY_ROUTE_OVERLAP,
      })
    },

    setTripEndpoint(role, endpoint) {
      setRequest(setTripEndpoint(state.tripRequest, role, endpoint))
    },

    clearTripEndpoint(role) {
      setRequest(clearTripEndpoint(state.tripRequest, role))
    },

    swapTripEndpoints() {
      setRequest(swapTripEndpoints(state.tripRequest))
    },

    clearTrip() {
      setRequest(createEmptyTripRequest())
    },

    selectVenue(result) {
      dependencies.map.selectVenue(result.venue)
    },

    clearVenue() {
      dependencies.map.clearVenue()
    },

    reportMapError(error) {
      updateState({ status: 'Unable to load map tiles' })
      console.error('Map error:', error)
    },

    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
      dependencies.map.dispose()
    },
  }
}

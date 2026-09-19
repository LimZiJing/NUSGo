import { contextualPanelReducer, createInitialContextualPanelState, type ContextualPanelAction, type ContextualPanelState } from '../domain/contextual-panel/state'
import type { TransitIndex } from '../domain/transit'
import { deriveTransitRouteOverlapMap } from '../domain/transit/overlap'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../domain/trip/endpoints'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocationMap } from '../domain/venue/types'
import {
  createInitialResourceStatus,
  deriveResourceStatus,
  markTransitFailed,
  markTransitLoaded,
  markVenueFailed,
  markVenueLoaded,
  type ResourceStatusState,
} from './resource-status'
import { reconcileRouteSelection } from './route-selection'
import {
  createNavigationSessionStartup,
  waitForAbortablePromise,
} from './navigation-session-startup'
import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import type { MapSession } from './contracts/map'
import {
  createVenueSearchResultSnapshot,
  canonicalizeTripEndpoint,
  hasMappedLocation,
  isTripEndpointRole,
  venuesMatch,
} from './navigation-session-validation'
import { freezeNavigationSessionSnapshot } from './navigation-session-snapshot'

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

export interface NavigationSessionState {
  readonly venues: VenueLocationMap | null
  readonly transitIndex: TransitIndex | null
  readonly selectedRouteId: string | null
  readonly selectedRouteColor: string | null
  readonly contextualPanel: ContextualPanelState
  readonly tripRequest: TripRequest
  readonly originSearchQuery: string
  readonly destinationSearchQuery: string
  readonly resourceStatus: ResourceStatusState
  readonly mapError: string | null
  readonly status: string
}

export interface NavigationSessionDependencies {
  readonly map: MapSession
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
}

export type NavigationSessionListener = () => void

export interface NavigationSession {
  getState(): NavigationSessionState
  subscribe(listener: NavigationSessionListener): () => void
  start(signal: AbortSignal): Promise<void>
  selectRoute(routeId: string | null): void
  setTripEndpoint(role: TripEndpointRole, endpoint: TripEndpoint): void
  clearTripEndpoint(role: TripEndpointRole): void
  swapTripEndpoints(): void
  clearTrip(): void
  setOriginSearchQuery(query: string): void
  setDestinationSearchQuery(query: string): void
  setContextualPanelQuery(query: string): void
  selectVenue(result: VenueSearchResult): void
  openVenueSearch(): void
  openShuttle(): void
  back(): void
  escape(): void
  close(): void
  handleMapClick(): void
  reportMapError(error: unknown): void
  dispose(): void
}

export function createInitialNavigationSessionState(): NavigationSessionState {
  return freezeNavigationSessionSnapshot({
    venues: null,
    transitIndex: null,
    selectedRouteId: null,
    selectedRouteColor: null,
    contextualPanel: createInitialContextualPanelState(),
    tripRequest: createEmptyTripRequest(),
    originSearchQuery: '',
    destinationSearchQuery: '',
    resourceStatus: createInitialResourceStatus(),
    mapError: null,
    status: 'Loading map data…',
  })
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'name' in error && error.name === 'AbortError'
}

function getTransitFailureMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TransitValidationError') {
    return `Transit route data validation failed: ${error.message}`
  }
  return 'Unable to load shuttle route data'
}

export function createNavigationSession(
  dependencies: NavigationSessionDependencies,
): NavigationSession {
  let state = createInitialNavigationSessionState()
  let transitIndex: TransitIndex | null = null
  let routeOverlapMap: ReadonlyMap<string, ReadonlySet<string>> = new globalThis.Map()
  let disposed = false
  const startup = createNavigationSessionStartup()
  const listeners = new Set<NavigationSessionListener>()

  const getStatus = (
    resourceStatus: ResourceStatusState = state.resourceStatus,
    mapError: string | null = state.mapError,
  ): string => {
    const resourceStatusMessage = deriveResourceStatus(resourceStatus)
    return mapError
      ? `${mapError}; ${resourceStatusMessage}`
      : resourceStatusMessage
  }

  const publishSnapshot = (nextState: NavigationSessionState): void => {
    if (disposed) return
    state = nextState
    for (const listener of listeners) listener()
  }

  const publish = (nextState: NavigationSessionState): void => {
    publishSnapshot(freezeNavigationSessionSnapshot(nextState))
  }

  const updateState = (patch: Partial<NavigationSessionState>): void => {
    const nextState = { ...state, ...patch }
    if ('resourceStatus' in patch || 'mapError' in patch) {
      nextState.status = getStatus(nextState.resourceStatus, nextState.mapError)
    }
    publish(nextState)
  }

  const syncTripRequest = (
    request: TripRequest,
    venues: VenueLocationMap,
    nextTransitIndex: TransitIndex | null,
  ): void => {
    dependencies.map.setTripRequest(
      request,
      venues,
      nextTransitIndex,
    )
  }

  const updateTripRequest = (
    request: TripRequest,
    patch: Partial<NavigationSessionState> = {},
  ): void => {
    if (disposed) return
    const nextState = freezeNavigationSessionSnapshot({
      ...state,
      ...patch,
      tripRequest: request,
    })
    syncTripRequest(nextState.tripRequest, state.venues ?? {}, transitIndex)
    publishSnapshot(nextState)
  }

  const setTripEndpointCommand = (role: TripEndpointRole, endpoint: TripEndpoint): void => {
    const canonicalEndpoint = canonicalizeTripEndpoint(endpoint, state.venues, transitIndex)
    if (
      disposed ||
      !isTripEndpointRole(role) ||
      canonicalEndpoint === null
    ) return
    updateTripRequest(setTripEndpoint(state.tripRequest, role, canonicalEndpoint), {
      ...(role === 'origin' ? { originSearchQuery: '' } : { destinationSearchQuery: '' }),
    })
  }

  const updateContextualPanel = (action: ContextualPanelAction): ContextualPanelState => {
    if (disposed) return state.contextualPanel
    const nextPanel = contextualPanelReducer(state.contextualPanel, action)
    updateState({ contextualPanel: nextPanel })
    return nextPanel
  }

  const clearVenueMarkerForBack = (): void => {
    const previousState = state.contextualPanel.history.at(-1)
    if (
      state.contextualPanel.mode === 'venue-detail' &&
      previousState?.mode !== 'venue-detail'
    ) {
      dependencies.map.clearVenue()
    }
  }

  const clearVenueMarkerForEscape = (): void => {
    const previousState = state.contextualPanel.history.at(-1)
    if (
      !previousState ||
      (state.contextualPanel.mode === 'venue-detail' && previousState.mode !== 'venue-detail')
    ) {
      dependencies.map.clearVenue()
    }
  }

  const handleVenueLoad = (data: LoadedVenueData): void => {
    const resourceStatus = markVenueLoaded(state.resourceStatus, data.venueCount)
    syncTripRequest(state.tripRequest, data.venues, transitIndex)
    updateState({ venues: data.venues, resourceStatus })
  }

  const handleTransitLoad = (data: LoadedTransitData): void => {
    const nextRouteOverlapMap = deriveTransitRouteOverlapMap(data.geometry)
    const reconciledSelection = reconcileRouteSelection(
      data.index,
      state.selectedRouteId,
      nextRouteOverlapMap,
    )

    transitIndex = data.index
    routeOverlapMap = nextRouteOverlapMap

    dependencies.map.loadTransitData(
      data,
      reconciledSelection,
      setTripEndpointCommand,
    )
    syncTripRequest(state.tripRequest, state.venues ?? {}, data.index)

    const resourceStatus = markTransitLoaded(state.resourceStatus, {
      stopCount: data.index.stops.length,
      routeCount: data.index.routes.length,
    })
    updateState({
      transitIndex: data.index,
      selectedRouteId: reconciledSelection.route?.id ?? null,
      selectedRouteColor: reconciledSelection.route?.color ?? null,
      resourceStatus,
    })
  }

  const handleLoadFailure = (
    resource: 'venue' | 'transit',
    error: unknown,
  ): void => {
    const message = resource === 'venue'
      ? 'Unable to load venue data'
      : getTransitFailureMessage(error)
    const resourceStatus = resource === 'venue'
      ? markVenueFailed(state.resourceStatus, message)
      : markTransitFailed(state.resourceStatus, message)
    updateState({ resourceStatus })
    console.error(error)
  }

  const loadVenues = (signal: AbortSignal): Promise<void> => (
    Promise.resolve()
      .then(() => dependencies.loadVenues(signal))
      .then((data) => {
        if (!disposed && !signal.aborted) handleVenueLoad(data)
      })
      .catch((error: unknown) => {
        if (disposed || signal.aborted || isAbortError(error)) return
        handleLoadFailure('venue', error)
      })
  )

  const loadTransit = (signal: AbortSignal): Promise<void> => (
    Promise.resolve()
      .then(() => dependencies.loadTransit(signal))
      .then(async (data) => {
        await waitForAbortablePromise(dependencies.map.ready, signal)
        if (!disposed && !signal.aborted) handleTransitLoad(data)
      })
      .catch((error: unknown) => {
        if (disposed || signal.aborted || isAbortError(error)) return
        handleLoadFailure('transit', error)
      })
  )


  return {
    getState() {
      return state
    },

    subscribe(listener) {
      if (!disposed) listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    start: (signal) => startup.start(signal, { loadVenues, loadTransit }),

    selectRoute(routeId) {
      if (disposed) return
      const selectedRoute = routeId && transitIndex
        ? transitIndex.routeById.get(routeId)
        : undefined
      const nextRouteId = selectedRoute?.id ?? null
      const overlappingRouteIds = nextRouteId
        ? routeOverlapMap.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
        : EMPTY_ROUTE_OVERLAP

      dependencies.map.setRouteSelection({
        route: selectedRoute ?? null,
        overlappingRouteIds,
      })
      updateState({
        selectedRouteId: nextRouteId,
        selectedRouteColor: selectedRoute?.color ?? null,
      })
    },

    setTripEndpoint(role, endpoint) {
      setTripEndpointCommand(role, endpoint)
    },

    clearTripEndpoint(role) {
      if (disposed || !isTripEndpointRole(role)) return
      updateTripRequest(clearTripEndpoint(state.tripRequest, role))
    },

    swapTripEndpoints() {
      updateTripRequest(swapTripEndpoints(state.tripRequest))
    },

    clearTrip() {
      updateTripRequest(createEmptyTripRequest(), {
        originSearchQuery: '',
        destinationSearchQuery: '',
      })
    },

    setOriginSearchQuery(query) {
      if (disposed) return
      updateState({ originSearchQuery: query })
    },

    setDestinationSearchQuery(query) {
      if (disposed) return
      updateState({ destinationSearchQuery: query })
    },

    setContextualPanelQuery(query) {
      if (disposed) return
      updateContextualPanel({ type: 'set-query', query })
    },

    selectVenue(result) {
      if (disposed) return
      if (typeof result?.code !== 'string') return
      const venue = state.venues?.[result.code]
      if (!hasMappedLocation(venue) || !result.venue || !venuesMatch(result.venue, venue)) return
      const canonicalResult = createVenueSearchResultSnapshot(result.code, venue)
      dependencies.map.selectVenue(venue)
      updateContextualPanel({ type: 'select-venue', result: canonicalResult })
    },

    openVenueSearch() {
      if (disposed) return
      updateContextualPanel({ type: 'open-venue-search' })
    },

    openShuttle() {
      if (disposed) return
      updateContextualPanel({ type: 'open-shuttle' })
    },

    back() {
      if (disposed) return
      clearVenueMarkerForBack()
      updateContextualPanel({ type: 'back' })
    },

    escape() {
      if (disposed) return
      clearVenueMarkerForEscape()
      updateContextualPanel({ type: 'escape' })
    },

    close() {
      if (disposed) return
      dependencies.map.clearVenue()
      updateContextualPanel({ type: 'close' })
    },

    handleMapClick() {
      if (disposed) return
      if (state.contextualPanel.mode !== 'venue-detail') return
      dependencies.map.clearVenue()
      updateContextualPanel({ type: 'map-click' })
    },

    reportMapError(error) {
      if (disposed) return
      updateState({ mapError: 'Unable to load map tiles' })
      console.error('Map error:', error)
    },

    dispose() {
      if (disposed) return
      disposed = true
      startup.dispose()
      listeners.clear()
      dependencies.map.dispose()
    },
  }
}

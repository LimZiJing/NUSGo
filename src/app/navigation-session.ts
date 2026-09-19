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
import type { VenueLocation, VenueLocationMap } from '../domain/venue/types'
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
import type { LoadedTransitData, MapSession } from './contracts/map'

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

export interface LoadedVenueData {
  readonly venues: VenueLocationMap
  readonly venueCount: number
}

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
  unsubscribe(listener: NavigationSessionListener): void
  start(signal: AbortSignal): Promise<void>
  selectRoute(routeId: string | null): void
  setTripEndpoint(role: TripEndpointRole, endpoint: TripEndpoint): void
  clearTripEndpoint(role: TripEndpointRole): void
  swapTripEndpoints(): void
  clearTrip(): void
  setOriginSearchQuery(query: string): void
  setDestinationSearchQuery(query: string): void
  dispatchContextualPanel(action: ContextualPanelAction): void
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
  return {
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
  }
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

function hasMappedLocation(venue: VenueLocation | undefined): venue is VenueLocation & {
  readonly location: { readonly x: number; readonly y: number }
} {
  const location = venue?.location
  return location !== undefined &&
    Number.isFinite(location.x) &&
    Number.isFinite(location.y)
}

function venuesMatch(first: VenueLocation, second: VenueLocation): boolean {
  const firstLocation = first.location
  const secondLocation = second.location
  const locationsMatch = firstLocation === undefined || secondLocation === undefined
    ? firstLocation === secondLocation
    : firstLocation.x === secondLocation.x && firstLocation.y === secondLocation.y
  return first.roomName === second.roomName &&
    first.floor === second.floor &&
    locationsMatch
}

export function createNavigationSession(
  dependencies: NavigationSessionDependencies,
): NavigationSession {
  let state = createInitialNavigationSessionState()
  let transitIndex: TransitIndex | null = null
  let routeOverlapMap: ReadonlyMap<string, ReadonlySet<string>> = new globalThis.Map()
  let disposed = false
  let startPromise: Promise<void> | null = null
  let startupAbortController: AbortController | null = null
  let removeExternalAbortListener: (() => void) | null = null
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

  const publish = (nextState: NavigationSessionState): void => {
    if (disposed) return
    state = nextState
    for (const listener of listeners) listener()
  }

  const updateState = (patch: Partial<NavigationSessionState>): void => {
    const nextState = { ...state, ...patch }
    if ('resourceStatus' in patch || 'mapError' in patch) {
      nextState.status = getStatus(nextState.resourceStatus, nextState.mapError)
    }
    publish(nextState)
  }

  const syncTripRequest = (request: TripRequest): void => {
    dependencies.map.setTripRequest(
      request,
      state.venues ?? {},
      transitIndex,
    )
  }

  const updateTripRequest = (
    request: TripRequest,
    patch: Partial<NavigationSessionState> = {},
  ): void => {
    if (disposed) return
    updateState({ ...patch, tripRequest: request })
    syncTripRequest(request)
  }

  const isKnownTripEndpoint = (endpoint: TripEndpoint): boolean => {
    if (typeof endpoint !== 'object' || endpoint === null || typeof endpoint.id !== 'string') {
      return false
    }
    if (endpoint.kind === 'venue') {
      return state.venues !== null && state.venues[endpoint.id] !== undefined
    }
    if (endpoint.kind === 'stop') {
      return transitIndex?.stopById.has(endpoint.id) ?? false
    }
    return false
  }

  const setTripEndpointCommand = (role: TripEndpointRole, endpoint: TripEndpoint): void => {
    if (disposed || !isKnownTripEndpoint(endpoint)) return
    updateTripRequest(setTripEndpoint(state.tripRequest, role, endpoint), {
      ...(role === 'origin' ? { originSearchQuery: '' } : { destinationSearchQuery: '' }),
    })
  }

  const dispatchContextualPanel = (action: ContextualPanelAction): ContextualPanelState => {
    if (disposed) return state.contextualPanel
    const nextPanel = contextualPanelReducer(state.contextualPanel, action)
    updateState({ contextualPanel: nextPanel })
    return nextPanel
  }

  const clearSelectedVenueMarkerWhenLeavingDetail = (): void => {
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
    updateState({ venues: data.venues, resourceStatus })
    syncTripRequest(state.tripRequest)
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
    syncTripRequest(state.tripRequest)
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
        await dependencies.map.ready
        if (!disposed && !signal.aborted) handleTransitLoad(data)
      })
      .catch((error: unknown) => {
        if (disposed || signal.aborted || isAbortError(error)) return
        handleLoadFailure('transit', error)
      })
  )

  const clearExternalAbortListener = (): void => {
    removeExternalAbortListener?.()
    removeExternalAbortListener = null
  }

  const start = (signal: AbortSignal): Promise<void> => {
    if (startPromise) return startPromise
    if (disposed) {
      startPromise = Promise.resolve()
      return startPromise
    }

    const controller = new AbortController()
    startupAbortController = controller
    const handleExternalAbort = () => controller.abort()
    signal.addEventListener('abort', handleExternalAbort, { once: true })
    removeExternalAbortListener = () => {
      signal.removeEventListener('abort', handleExternalAbort)
    }
    if (signal.aborted) controller.abort()

    startPromise = Promise.all([
      loadVenues(controller.signal),
      loadTransit(controller.signal),
    ])
      .then(() => undefined)
      .finally(clearExternalAbortListener)
    return startPromise
  }

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

    unsubscribe(listener) {
      listeners.delete(listener)
    },

    start,

    selectRoute(routeId) {
      if (disposed) return
      const selectedRoute = routeId && transitIndex
        ? transitIndex.routeById.get(routeId)
        : undefined
      const nextRouteId = selectedRoute?.id ?? null
      const overlappingRouteIds = nextRouteId
        ? routeOverlapMap.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
        : EMPTY_ROUTE_OVERLAP

      updateState({
        selectedRouteId: nextRouteId,
        selectedRouteColor: selectedRoute?.color ?? null,
      })
      dependencies.map.setRouteSelection({
        route: selectedRoute ?? null,
        overlappingRouteIds,
      })
    },

    setTripEndpoint(role, endpoint) {
      setTripEndpointCommand(role, endpoint)
    },

    clearTripEndpoint(role) {
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

    dispatchContextualPanel(action) {
      if (disposed) return
      dispatchContextualPanel(action)
    },

    setContextualPanelQuery(query) {
      if (disposed) return
      dispatchContextualPanel({ type: 'set-query', query })
    },

    selectVenue(result) {
      if (disposed) return
      if (typeof result?.code !== 'string') return
      const venue = state.venues?.[result.code]
      if (!hasMappedLocation(venue) || !result.venue || !venuesMatch(result.venue, venue)) return
      const canonicalResult = { code: result.code, venue }
      dispatchContextualPanel({ type: 'select-venue', result: canonicalResult })
      dependencies.map.selectVenue(venue)
    },

    openVenueSearch() {
      if (disposed) return
      dispatchContextualPanel({ type: 'open-venue-search' })
    },

    openShuttle() {
      if (disposed) return
      dispatchContextualPanel({ type: 'open-shuttle' })
    },

    back() {
      if (disposed) return
      clearSelectedVenueMarkerWhenLeavingDetail()
      dispatchContextualPanel({ type: 'back' })
    },

    escape() {
      if (disposed) return
      clearSelectedVenueMarkerWhenLeavingDetail()
      dispatchContextualPanel({ type: 'escape' })
    },

    close() {
      if (disposed) return
      dependencies.map.clearVenue()
      dispatchContextualPanel({ type: 'close' })
    },

    handleMapClick() {
      if (disposed) return
      if (state.contextualPanel.mode !== 'venue-detail') return
      dependencies.map.clearVenue()
      dispatchContextualPanel({ type: 'map-click' })
    },

    reportMapError(error) {
      if (disposed) return
      updateState({ mapError: 'Unable to load map tiles' })
      console.error('Map error:', error)
    },

    dispose() {
      if (disposed) return
      disposed = true
      startupAbortController?.abort()
      clearExternalAbortListener()
      listeners.clear()
      dependencies.map.dispose()
    },
  }
}

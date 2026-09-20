import { createInitialContextualPanelState, type ContextualPanelState } from '../domain/contextual-panel/state'
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
import { createNavigationSessionStartup } from './navigation-session-startup'
import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import type { MapSession, MapViewportInsets } from './contracts/map'
import { getResetTarget } from './map-camera'
import { createNavigationSessionResourceLoading } from './navigation-session-loading'
import { canonicalizeTripEndpoint, isTripEndpointRole } from './navigation-session-validation'
import { freezeNavigationSessionSnapshot } from './navigation-session-snapshot'
import {
  createNavigationSessionPanelTransitions,
  createNavigationSessionTransitionQueue,
} from './navigation-session-transitions'

const STARTUP_FAILURE_STATUS = 'Unable to start map navigation'
const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

export interface NavigationSessionStartupFailure {
  readonly message: string
}

export interface NavigationSessionState {
  readonly venues: VenueLocationMap | null
  readonly transitIndex: TransitIndex | null
  readonly selectedRouteId: string | null
  readonly selectedRouteColor: string | null
  readonly contextualPanel: ContextualPanelState
  readonly tripRequest: TripRequest
  readonly resourceStatus: ResourceStatusState
  readonly mapError: string | null
  readonly startupFailure: NavigationSessionStartupFailure | null
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
  setContextualPanelQuery(query: string): void
  selectVenue(result: VenueSearchResult): void
  reportStartupFailure(): void
  openVenueSearch(): void
  openShuttle(): void
  back(): void
  escape(): void
  close(): void
  handleMapClick(): void
  setViewportInsets(insets: MapViewportInsets): void
  zoomIn(): void
  zoomOut(): void
  resetView(): void
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
    resourceStatus: createInitialResourceStatus(),
    mapError: null,
    startupFailure: null,
    status: 'Loading map data…',
  })
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
  const transitionQueue = createNavigationSessionTransitionQueue(() => disposed)
  const enqueueTransition = transitionQueue.enqueue

  let startupFailureReported = false
  let viewportInsets: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  const getStatus = (
    resourceStatus: ResourceStatusState = state.resourceStatus,
    mapError: string | null = state.mapError,
  ): string => {
    if (startupFailureReported) return STARTUP_FAILURE_STATUS
    const resourceStatusMessage = deriveResourceStatus(resourceStatus)
    return mapError
      ? `${mapError}; ${resourceStatusMessage}`
      : resourceStatusMessage
  }

  const publishSnapshot = (nextState: NavigationSessionState): void => {
    if (disposed) return
    state = nextState
    const listenerSnapshot = [...listeners]
    for (const listener of listenerSnapshot) {
      if (disposed) return
      listener()
    }
  }

  const publish = (nextState: NavigationSessionState): void => {
    publishSnapshot(freezeNavigationSessionSnapshot(nextState))
  }

  const publishStartupFailure = (): void => {
    if (disposed) return
    state = freezeNavigationSessionSnapshot({
      ...state,
      startupFailure: { message: STARTUP_FAILURE_STATUS },
      status: STARTUP_FAILURE_STATUS,
    })
    const listenerSnapshot = [...listeners]
    for (const listener of listenerSnapshot) {
      if (disposed) return
      try {
        listener()
      } catch (error) {
        console.error('Navigation session startup failure listener failed:', error)
      }
    }
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
    enqueueTransition(() => {
      if (disposed) return
      updateTripRequest(setTripEndpoint(state.tripRequest, role, canonicalEndpoint))
    })
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

    const previousTransitIndex = transitIndex
    const previousRouteOverlapMap = routeOverlapMap
    transitIndex = data.index
    routeOverlapMap = nextRouteOverlapMap
    try {
      dependencies.map.loadTransitData(
        data,
        reconciledSelection,
        setTripEndpointCommand,
      )
      syncTripRequest(state.tripRequest, state.venues ?? {}, data.index)
    } catch (error) {
      transitIndex = previousTransitIndex
      routeOverlapMap = previousRouteOverlapMap
      throw error
    }

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

  const resourceLoading = createNavigationSessionResourceLoading({
    mapReady: dependencies.map.ready,
    isDisposed: () => disposed,
    loadVenues: dependencies.loadVenues,
    loadTransit: dependencies.loadTransit,
    enqueue: enqueueTransition,
    onVenueLoaded: handleVenueLoad,
    onTransitLoaded: handleTransitLoad,
    onLoadFailure: handleLoadFailure,
  })

  const panelTransitions = createNavigationSessionPanelTransitions({
    isDisposed: () => disposed,
    enqueue: enqueueTransition,
    getContextualPanel: () => state.contextualPanel,
    getVenues: () => state.venues,
    setContextualPanel: (contextualPanel) => updateState({ contextualPanel }),
    selectVenue: (venue) => dependencies.map.selectVenue(venue),
    clearVenue: () => dependencies.map.clearVenue(),
  })


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

    start: (signal) => startup.start(signal, resourceLoading),

    selectRoute(routeId) {
      enqueueTransition(() => {
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
      })
    },

    setTripEndpoint(role, endpoint) {
      setTripEndpointCommand(role, endpoint)
    },

    clearTripEndpoint(role) {
      enqueueTransition(() => {
        if (disposed || !isTripEndpointRole(role)) return
        updateTripRequest(clearTripEndpoint(state.tripRequest, role))
      })
    },

    swapTripEndpoints() {
      enqueueTransition(() => {
        if (disposed) return
        updateTripRequest(swapTripEndpoints(state.tripRequest))
      })
    },

    clearTrip() {
      enqueueTransition(() => {
        if (disposed) return
        updateTripRequest(createEmptyTripRequest())
      })
    },

    ...panelTransitions,

    setViewportInsets(insets: MapViewportInsets) {
      if (disposed) return
      viewportInsets = { ...insets }
      dependencies.map.setViewportInsets(viewportInsets)
    },

    zoomIn() {
      if (disposed) return
      dependencies.map.zoomIn()
    },

    zoomOut() {
      if (disposed) return
      dependencies.map.zoomOut()
    },

    resetView() {
      enqueueTransition(() => {
        if (disposed) return
        dependencies.map.resetView(getResetTarget({
          panelMode: state.contextualPanel.mode,
          selectedVenue: state.contextualPanel.selectedVenue,
          selectedRouteId: state.selectedRouteId,
          tripRequest: state.tripRequest,
          venues: state.venues,
          transitIndex,
        }))
      })
    },

    reportMapError(error) {
      enqueueTransition(() => {
        if (disposed) return
        updateState({ mapError: 'Unable to load map tiles' })
        console.error('Map error:', error)
      })
    },

    reportStartupFailure() {
      enqueueTransition(() => {
        if (disposed || startupFailureReported) return
        startupFailureReported = true
        publishStartupFailure()
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      transitionQueue.clear()
      startup.dispose()
      listeners.clear()
      dependencies.map.dispose()
    },
  }
}

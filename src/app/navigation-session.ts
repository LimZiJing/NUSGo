import { createInitialContextualPanelState, type ContextualPanelState } from '../features/contextual-panel/state'
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
import type { LocationTracker } from './contracts/location'
import type { MapSession, MapViewportInsets } from './contracts/map'
import {
  INITIAL_LOCATION_TRACKING_STATE,
  type LocationTrackingState,
} from '../domain/location/types'
import { isValidLocationCoordinates } from '../domain/location/coordinates'
import { NoJourneyAvailableError, type JourneyPlanningService } from './journey-planning'
import { createInitialJourneyState, type JourneyState } from './journey-state'
import { getLocationControlTarget, getResetTarget } from './map-camera'
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
  readonly rememberedMobileRouteId: string | null
  readonly contextualPanel: ContextualPanelState
  readonly tripRequest: TripRequest
  readonly journey: JourneyState
  readonly location: LocationTrackingState
  readonly locationMarkerVisible: boolean
  readonly resourceStatus: ResourceStatusState
  readonly mapError: string | null
  readonly startupFailure: NavigationSessionStartupFailure | null
  readonly status: string
}

export interface NavigationSessionDependencies {
  readonly map: MapSession
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
  readonly journeyPlanner?: JourneyPlanningService
  readonly locationTracker: LocationTracker
  readonly onMapStopInteraction?: (stopId: string) => void
}

export type NavigationSessionListener = () => void

export interface NavigationSession {
  getState(): NavigationSessionState
  subscribe(listener: NavigationSessionListener): () => void
  start(signal: AbortSignal): Promise<void>
  selectRoute(routeId: string | null): void
  enterMobileRoutes(): void
  suspendMobileRoutes(): void
  leaveMobileRoutes(): void
  selectMobileRoute(routeId: string): void
  focusStop(stopId: string): void
  focusStopInStopsTab(stopId: string): void
  setStopsPinVisible(visible: boolean): void
  enableLocationTracking(): void
  locateUser(): void
  disableLocationTracking(): void
  hideLocationMarker(): void
  showLocationMarker(): void
  setTripEndpoint(role: TripEndpointRole, endpoint: TripEndpoint): void
  clearTripEndpoint(role: TripEndpointRole): void
  swapTripEndpoints(): void
  clearTrip(): void
  replanJourney(): void
  setContextualPanelQuery(query: string): void
  selectVenue(result: VenueSearchResult): void
  reportStartupFailure(): void
  openVenueSearch(): void
  openShuttle(): void
  openShuttleRouteDetail(): void
  back(): void
  escape(): void
  close(): void
  closeToRoot(): void
  handleMapClick(): void
  setViewportInsets(insets: MapViewportInsets): void
  dismissMapPopup(): boolean
  zoomIn(): void
  zoomOut(): void
  resetView(): void
  reportMapError(error: unknown): void
  dispose(): void
}

export function createInitialNavigationSessionState(
  location: LocationTrackingState = INITIAL_LOCATION_TRACKING_STATE,
): NavigationSessionState {
  return freezeNavigationSessionSnapshot({
    venues: null,
    transitIndex: null,
    selectedRouteId: null,
    selectedRouteColor: null,
    rememberedMobileRouteId: null,
    contextualPanel: createInitialContextualPanelState(),
    tripRequest: createEmptyTripRequest(),
    journey: createInitialJourneyState(),
    location,
    locationMarkerVisible: true,
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
  let state = createInitialNavigationSessionState(dependencies.locationTracker.getState())
  let transitIndex: TransitIndex | null = null
  let transitData: LoadedTransitData | null = null
  let routeOverlapMap: ReadonlyMap<string, ReadonlySet<string>> = new globalThis.Map()
  let disposed = false
  let mobileRoutesActive = false
  let locationFocusRequested = false
  const startup = createNavigationSessionStartup()
  const listeners = new Set<NavigationSessionListener>()
  const transitionQueue = createNavigationSessionTransitionQueue(() => disposed)
  const enqueueTransition = transitionQueue.enqueue

  let startupFailureReported = false
  let viewportInsets: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  let journeyPlanningAbortController: AbortController | null = null
  let journeyPlanningRequestId = 0
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

  const unsubscribeLocation = dependencies.locationTracker.subscribe(() => {
    if (disposed) return
    const location = dependencies.locationTracker.getState()
    dependencies.map.setCurrentLocation(location.latestFix, state.locationMarkerVisible)
    if (locationFocusRequested && location.latestFix) {
      locationFocusRequested = false
      dependencies.map.focusCurrentLocation(location.latestFix)
    }
    updateState({ location })
  })

  dependencies.map.setCurrentLocation(state.location.latestFix, state.locationMarkerVisible)

  const cancelJourneyPlanning = (): void => {
    journeyPlanningRequestId += 1
    journeyPlanningAbortController?.abort()
    journeyPlanningAbortController = null
  }

  const resetJourney = (): void => {
    cancelJourneyPlanning()
    dependencies.map.setJourney(null)
    if (state.journey.status !== 'idle' || state.journey.journey !== null || state.journey.error !== null) {
      updateState({ journey: createInitialJourneyState() })
    }
  }

  const requestJourneyPlanning = (): void => {
    cancelJourneyPlanning()
    const journeyPlanner = dependencies.journeyPlanner

    if (
      !journeyPlanner ||
      !state.tripRequest.origin ||
      !state.tripRequest.destination ||
      !state.venues ||
      !transitData
    ) {
      resetJourney()
      return
    }

    const requestId = journeyPlanningRequestId
    const controller = new AbortController()
    journeyPlanningAbortController = controller
    const request = {
      tripRequest: state.tripRequest,
      venues: state.venues,
      transit: transitData,
      signal: controller.signal,
    }
    dependencies.map.setJourney(null)
    updateState({
      journey: { status: 'loading', journey: null, error: null },
    })

    void journeyPlanner(request).then(
      (journey) => {
        if (disposed || controller.signal.aborted || requestId !== journeyPlanningRequestId) return
        enqueueTransition(() => {
          if (disposed || controller.signal.aborted || requestId !== journeyPlanningRequestId) return
          journeyPlanningAbortController = null
          dependencies.map.setJourney(journey)
          updateState({
            journey: journey
              ? { status: 'ready', journey, error: null }
              : { status: 'no-route', journey: null, error: null },
          })
        })
      },
      (error: unknown) => {
        if (disposed || controller.signal.aborted || requestId !== journeyPlanningRequestId) return
        enqueueTransition(() => {
          if (disposed || controller.signal.aborted || requestId !== journeyPlanningRequestId) return
          journeyPlanningAbortController = null
          dependencies.map.setJourney(null)
          if (error instanceof NoJourneyAvailableError) {
            updateState({
              journey: {
                status: 'no-route',
                journey: null,
                error: error.message,
              },
            })
            return
          }
          updateState({
            journey: {
              status: 'failed',
              journey: null,
              error: 'Unable to plan journey',
            },
          })
          console.error('Journey planning failed:', error)
        })
      },
    )
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
    requestJourneyPlanning()
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
    requestJourneyPlanning()
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
    const previousTransitData = transitData
    transitIndex = data.index
    transitData = data
    routeOverlapMap = nextRouteOverlapMap
    try {
      dependencies.map.loadTransitData(
        data,
        reconciledSelection,
        (role, endpoint) => {
          setTripEndpointCommand(role, endpoint)
          if (endpoint.kind === 'stop') dependencies.onMapStopInteraction?.(endpoint.id)
        },
      )
      syncTripRequest(state.tripRequest, state.venues ?? {}, data.index)
    } catch (error) {
      transitIndex = previousTransitIndex
      transitData = previousTransitData
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
      rememberedMobileRouteId: state.rememberedMobileRouteId && data.index.routeById.has(state.rememberedMobileRouteId)
        ? state.rememberedMobileRouteId
        : null,
      resourceStatus,
    })
    if (mobileRoutesActive) activateMobileRoute()
    requestJourneyPlanning()
  }

  const handleLoadFailure = (
    resource: 'venue' | 'transit',
    error: unknown,
  ): void => {
    if (resource === 'transit') {
      transitData = null
      resetJourney()
    } else if (resource === 'venue') {
      resetJourney()
    }
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
    clearRouteSelection: () => {
      dependencies.map.setRouteSelection({
        route: null,
        overlappingRouteIds: EMPTY_ROUTE_OVERLAP,
      })
      updateState({
        selectedRouteId: null,
        selectedRouteColor: null,
      })
    },
  })

  const setActiveRoute = (routeId: string | null, remember: boolean, fit = true): void => {
    const route = routeId && transitIndex ? transitIndex.routeById.get(routeId) : undefined
    const nextRouteId = route?.id ?? null
    const selection = {
      route: route ?? null,
      overlappingRouteIds: nextRouteId
        ? routeOverlapMap.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
        : EMPTY_ROUTE_OVERLAP,
    }
    if (fit) dependencies.map.setRouteSelection(selection)
    else dependencies.map.setRouteSelection(selection, false)
    updateState({
      selectedRouteId: nextRouteId,
      selectedRouteColor: route?.color ?? null,
      ...(remember && nextRouteId ? { rememberedMobileRouteId: nextRouteId } : {}),
    })
  }

  function activateMobileRoute(): void {
    const routeId = state.rememberedMobileRouteId && transitIndex?.routeById.has(state.rememberedMobileRouteId)
      ? state.rememberedMobileRouteId
      : transitIndex?.routes[0]?.id ?? null
    if (!routeId) return
    setActiveRoute(routeId, true)
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

    start: (signal) => startup.start(signal, resourceLoading),

    selectRoute(routeId) {
      enqueueTransition(() => {
        if (disposed) return
        setActiveRoute(routeId, false)
      })
    },

    enterMobileRoutes() {
      enqueueTransition(() => {
        if (disposed) return
        mobileRoutesActive = true
        panelTransitions.openShuttle()
        activateMobileRoute()
      })
    },

    suspendMobileRoutes() {
      enqueueTransition(() => {
        if (disposed || !mobileRoutesActive) return
        mobileRoutesActive = false
        dependencies.map.dismissPopup()
        setActiveRoute(null, false, false)
      })
    },

    leaveMobileRoutes() {
      enqueueTransition(() => {
        if (disposed) return
        mobileRoutesActive = false
        dependencies.map.dismissPopup()
        setActiveRoute(null, false, false)
        panelTransitions.closeToRoot()
      })
    },

    selectMobileRoute(routeId) {
      enqueueTransition(() => {
        if (disposed || !mobileRoutesActive || !transitIndex?.routeById.has(routeId)) return
        dependencies.map.dismissPopup()
        if (state.selectedRouteId === routeId) {
          dependencies.map.refitRoute()
          return
        }
        setActiveRoute(routeId, true)
      })
    },

    focusStop(stopId) {
      enqueueTransition(() => {
        if (disposed || !transitIndex?.stopById.has(stopId)) return
        dependencies.map.focusStop(stopId)
      })
    },

    focusStopInStopsTab(stopId) {
      enqueueTransition(() => {
        if (disposed || !transitIndex?.stopById.has(stopId)) return
        dependencies.map.focusStopInStopsTab(stopId)
      })
    },

    setStopsPinVisible(visible) {
      if (disposed) return
      dependencies.map.setStopsPinVisible(visible)
    },

    enableLocationTracking() {
      if (disposed) return
      if (!state.locationMarkerVisible) {
        dependencies.map.setCurrentLocation(state.location.latestFix, true)
        updateState({ locationMarkerVisible: true })
      }
      // Keep this call synchronous so browsers can associate permission with the user's action.
      dependencies.locationTracker.enable()
    },

    locateUser() {
      if (disposed) return
      const currentLocation = state.location
      const hasLocationError = currentLocation.status === 'denied' ||
        currentLocation.status === 'unavailable' ||
        currentLocation.status === 'timeout' ||
        currentLocation.status === 'invalid'
      const shouldRestartTracking = hasLocationError || currentLocation.status === 'stale'

      if (shouldRestartTracking) {
        dependencies.locationTracker.disable()
      }

      if (!state.locationMarkerVisible) {
        dependencies.map.setCurrentLocation(currentLocation.latestFix, true)
        updateState({ locationMarkerVisible: true })
      }

      const hasActiveLocationFix = currentLocation.status === 'tracking' &&
        currentLocation.latestFix !== null &&
        isValidLocationCoordinates(
          currentLocation.latestFix.longitude,
          currentLocation.latestFix.latitude,
        )

      if (hasActiveLocationFix) {
        locationFocusRequested = false
        dependencies.map.focusCurrentLocation(currentLocation.latestFix!)
      } else {
        dependencies.map.resetView(getLocationControlTarget(currentLocation))
        locationFocusRequested = true
      }

      // Keep this call synchronous so browsers can associate permission with the user's action.
      dependencies.locationTracker.enable()
    },

    disableLocationTracking() {
      if (disposed) return
      dependencies.locationTracker.disable()
    },

    hideLocationMarker() {
      if (disposed) return
      dependencies.map.setCurrentLocation(state.location.latestFix, false)
      updateState({ locationMarkerVisible: false })
    },

    showLocationMarker() {
      if (disposed) return
      dependencies.map.setCurrentLocation(state.location.latestFix, true)
      updateState({ locationMarkerVisible: true })
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

    replanJourney() {
      if (disposed) return
      cancelJourneyPlanning()
      enqueueTransition(() => {
        if (!disposed) requestJourneyPlanning()
      })
    },

    ...panelTransitions,

    setViewportInsets(insets: MapViewportInsets) {
      if (disposed) return
      viewportInsets = { ...insets }
      dependencies.map.setViewportInsets(viewportInsets)
    },

    dismissMapPopup() {
      if (disposed) return false
      return dependencies.map.dismissPopup()
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
      cancelJourneyPlanning()
      unsubscribeLocation()
      dependencies.locationTracker.dispose()
      listeners.clear()
      dependencies.map.dispose()
    },
  }
}

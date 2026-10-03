import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import type { LocationTracker } from './contracts/location'
import type { MapSession, MapSessionOptions } from './contracts/map'
import type { MapViewportInsets } from './contracts/map'
import type { JourneyPlanningService } from './journey-planning'
import type {
  NavigationSession,
  NavigationSessionDependencies,
} from './navigation-session'

export interface NavigationSessionMountDependencies {
  readonly createMapSession: (options: MapSessionOptions) => MapSession
  readonly createNavigationSession: (
    dependencies: NavigationSessionDependencies,
  ) => NavigationSession
  readonly loadVenues: (signal: AbortSignal) => Promise<LoadedVenueData>
  readonly loadTransit: (signal: AbortSignal) => Promise<LoadedTransitData>
  readonly journeyPlanner: JourneyPlanningService
  readonly locationTracker: LocationTracker
  readonly onStopSelected?: (stopId: string) => boolean
  readonly onMapStopInteraction?: (stopId: string) => void
  readonly onMapCenterChange?: MapSessionOptions['onMapCenterChange']
}

export interface NavigationSessionMount {
  readonly session: NavigationSession
  dispose(): void
}

export function createNavigationSessionMount(
  container: HTMLElement,
  dependencies: NavigationSessionMountDependencies,
): NavigationSessionMount {
  let session: NavigationSession | null = null
  const map = dependencies.createMapSession({
    container,
    onMapError: (error) => session?.reportMapError(error),
    onEmptyMapClick: () => session?.handleMapClick(),
    onStopSelected: dependencies.onStopSelected,
    onMapCenterChange: dependencies.onMapCenterChange,
  })
  session = dependencies.createNavigationSession({
    map,
    loadVenues: dependencies.loadVenues,
    loadTransit: dependencies.loadTransit,
    journeyPlanner: dependencies.journeyPlanner,
    locationTracker: dependencies.locationTracker,
    onMapStopInteraction: dependencies.onMapStopInteraction,
  })

  const controller = new AbortController()
  void session.start(controller.signal).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') return
    console.error('Navigation session startup failed:', error)
    try {
      session?.reportStartupFailure()
    } catch (reportError) {
      console.error('Navigation session startup failure state update failed:', reportError)
    }
  })

  return {
    session,
    dispose() {
      controller.abort()
      session?.dispose()
      session = null
    },
  }
}

export interface NavigationSessionCommands {
  readonly swapTripEndpoints: () => void
  readonly selectOriginEndpoint: (
    endpoint: Parameters<NavigationSession['setTripEndpoint']>[1],
  ) => void
  readonly clearOriginEndpoint: () => void
  readonly selectDestinationEndpoint: (
    endpoint: Parameters<NavigationSession['setTripEndpoint']>[1],
  ) => void
  readonly clearDestinationEndpoint: () => void
  readonly clearTrip: () => void
  readonly setContextualPanelQuery: (query: string) => void
  readonly selectVenue: (result: Parameters<NavigationSession['selectVenue']>[0]) => void
  readonly back: () => void
  readonly closeToRoot: () => void
  readonly escape: () => void
  readonly enterMobileRoutes: () => void
  readonly suspendMobileRoutes: () => void
  readonly leaveMobileRoutes: () => void
  readonly selectMobileRoute: (routeId: string) => void
  readonly focusStop: (stopId: string) => void
  readonly focusStopInStopsTab: (stopId: string) => void
  readonly setStopsPinVisible: (visible: boolean) => void
  readonly enableLocationTracking: () => void
  readonly locateUser: () => void
  readonly disableLocationTracking: () => void
  readonly hideLocationMarker: () => void
  readonly showLocationMarker: () => void
  readonly setViewportInsets: (insets: MapViewportInsets) => void
  readonly dismissMapPopup: () => boolean
  readonly zoomIn: () => void
  readonly zoomOut: () => void
  readonly resetView: () => void
}

function createNavigationSessionCommands(
  session: NavigationSession | null,
): NavigationSessionCommands {
  return {
    swapTripEndpoints: () => session?.swapTripEndpoints(),
    selectOriginEndpoint: (endpoint) => session?.setTripEndpoint('origin', endpoint),
    clearOriginEndpoint: () => session?.clearTripEndpoint('origin'),
    selectDestinationEndpoint: (endpoint) => session?.setTripEndpoint('destination', endpoint),
    clearDestinationEndpoint: () => session?.clearTripEndpoint('destination'),
    clearTrip: () => session?.clearTrip(),
    setContextualPanelQuery: (query) => session?.setContextualPanelQuery(query),
    selectVenue: (result) => session?.selectVenue(result),
    back: () => session?.back(),
    closeToRoot: () => session?.closeToRoot(),
    escape: () => session?.escape(),
    enterMobileRoutes: () => session?.enterMobileRoutes(),
    suspendMobileRoutes: () => session?.suspendMobileRoutes(),
    leaveMobileRoutes: () => session?.leaveMobileRoutes(),
    selectMobileRoute: (routeId) => session?.selectMobileRoute(routeId),
    focusStop: (stopId) => session?.focusStop(stopId),
    focusStopInStopsTab: (stopId) => session?.focusStopInStopsTab(stopId),
    setStopsPinVisible: (visible) => session?.setStopsPinVisible(visible),
    enableLocationTracking: () => session?.enableLocationTracking(),
    locateUser: () => session?.locateUser(),
    disableLocationTracking: () => session?.disableLocationTracking(),
    hideLocationMarker: () => session?.hideLocationMarker(),
    showLocationMarker: () => session?.showLocationMarker(),
    setViewportInsets: (insets) => session?.setViewportInsets(insets),
    dismissMapPopup: () => session?.dismissMapPopup() ?? false,
    zoomIn: () => session?.zoomIn(),
    zoomOut: () => session?.zoomOut(),
    resetView: () => session?.resetView(),
  }
}

export function createNavigationSessionCommandAdapter(): (
  session: NavigationSession | null,
) => NavigationSessionCommands {
  let initialized = false
  let currentSession: NavigationSession | null = null
  let currentCommands: NavigationSessionCommands

  return (session) => {
    if (initialized && session === currentSession) return currentCommands
    initialized = true
    currentSession = session
    currentCommands = createNavigationSessionCommands(session)
    return currentCommands
  }
}

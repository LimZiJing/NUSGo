import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import type { MapSession, MapSessionOptions } from './contracts/map'
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
  })
  session = dependencies.createNavigationSession({
    map,
    loadVenues: dependencies.loadVenues,
    loadTransit: dependencies.loadTransit,
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
  readonly openVenueSearch: () => void
  readonly openShuttle: () => void
  readonly back: () => void
  readonly close: () => void
  readonly escape: () => void
  readonly selectRoute: (routeId: string | null) => void
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
    openVenueSearch: () => session?.openVenueSearch(),
    openShuttle: () => session?.openShuttle(),
    back: () => session?.back(),
    close: () => session?.close(),
    escape: () => session?.escape(),
    selectRoute: (routeId) => session?.selectRoute(routeId),
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

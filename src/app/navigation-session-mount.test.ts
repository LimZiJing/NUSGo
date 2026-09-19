import { describe, expect, it, vi } from 'vitest'
import type { LoadedTransitData } from './contracts/data'
import type { MapSession, MapSessionOptions } from './contracts/map'
import {
  createInitialNavigationSessionState,
  type NavigationSession,
} from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'

function createMapDouble(): MapSession {
  return {
    ready: Promise.resolve(),
    loadTransitData: vi.fn(),
    setRouteSelection: vi.fn(),
    setTripRequest: vi.fn(),
    selectVenue: vi.fn(),
    clearVenue: vi.fn(),
    dispose: vi.fn(),
  }
}

function createSessionDouble(overrides: Partial<NavigationSession> = {}): NavigationSession {
  return {
    getState: vi.fn(() => createInitialNavigationSessionState()),
    subscribe: vi.fn(() => () => undefined),
    start: vi.fn(async () => undefined),
    selectRoute: vi.fn(),
    setTripEndpoint: vi.fn(),
    clearTripEndpoint: vi.fn(),
    swapTripEndpoints: vi.fn(),
    clearTrip: vi.fn(),
    setContextualPanelQuery: vi.fn(),
    selectVenue: vi.fn(),
    openVenueSearch: vi.fn(),
    openShuttle: vi.fn(),
    back: vi.fn(),
    escape: vi.fn(),
    close: vi.fn(),
    handleMapClick: vi.fn(),
    reportMapError: vi.fn(),
    reportStartupFailure: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  }
}

function createMountDependencies(
  map: MapSession,
  session: NavigationSession,
) {
  let mapOptions: MapSessionOptions | null = null
  return {
    createMapSession: vi.fn((options: MapSessionOptions) => {
      mapOptions = options
      return map
    }),
    createNavigationSession: vi.fn(() => session),
    loadVenues: vi.fn(async () => ({ venues: {}, venueCount: 0 })),
    loadTransit: vi.fn(async () => new Promise<LoadedTransitData>(() => undefined)),
    getMapOptions: () => mapOptions,
  }
}

describe('navigation session application seam', () => {
  it('installs one map/session pair per mount and disposes it on unmount', () => {
    const map = createMapDouble()
    const session = createSessionDouble()
    const dependencies = createMountDependencies(map, session)
    const container = {} as HTMLElement

    const mount = createNavigationSessionMount(container, dependencies)
    const mapOptions = dependencies.getMapOptions()
    const mapError = new Error('tile failure')
    mapOptions?.onMapError(mapError)
    mapOptions?.onEmptyMapClick()
    expect(session.reportMapError).toHaveBeenCalledWith(mapError)
    expect(session.handleMapClick).toHaveBeenCalledOnce()

    expect(dependencies.createMapSession).toHaveBeenCalledOnce()
    expect(dependencies.createMapSession).toHaveBeenCalledWith(expect.objectContaining({ container }))
    expect(dependencies.createNavigationSession).toHaveBeenCalledOnce()
    expect(dependencies.createNavigationSession).toHaveBeenCalledWith({
      map,
      loadVenues: dependencies.loadVenues,
      loadTransit: dependencies.loadTransit,
    })
    expect(session.start).toHaveBeenCalledOnce()

    const startSignal = vi.mocked(session.start).mock.calls[0]?.[0]
    expect(startSignal).toBeInstanceOf(AbortSignal)
    mount.dispose()

    expect(startSignal?.aborted).toBe(true)
    expect(session.dispose).toHaveBeenCalledOnce()
    mapOptions?.onMapError(new Error('late tile failure'))
    mapOptions?.onEmptyMapClick()
    expect(session.reportMapError).toHaveBeenCalledOnce()
    expect(session.handleMapClick).toHaveBeenCalledOnce()
    mount.dispose()
    expect(session.dispose).toHaveBeenCalledOnce()
  })

  it('surfaces a safe startup failure after a non-abort rejection', async () => {
    const startupError = new Error('map effect failed')
    let state = createInitialNavigationSessionState()
    const reportStartupFailure = vi.fn(() => {
      state = { ...state, status: 'Unable to start map navigation' }
    })
    const session = createSessionDouble({
      getState: vi.fn(() => state),
      start: vi.fn(async () => {
        throw startupError
      }),
      reportStartupFailure,
    })
    const dependencies = createMountDependencies(createMapDouble(), session)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const mount = createNavigationSessionMount({} as HTMLElement, dependencies)
      await vi.waitFor(() => expect(reportStartupFailure).toHaveBeenCalledOnce())
      expect(session.getState().status).toBe('Unable to start map navigation')
      expect(session.getState().status).not.toBe('Loading map data…')
      expect(consoleError).toHaveBeenCalledWith(
        'Navigation session startup failed:',
        startupError,
      )
      mount.dispose()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('keeps command callbacks stable for the mounted session', () => {
    const session = createSessionDouble()
    const adapter = createNavigationSessionCommandAdapter()

    const firstCommands = adapter(session)
    const secondCommands = adapter(session)

    expect(secondCommands).toBe(firstCommands)
    expect(secondCommands.selectOriginEndpoint).toBe(firstCommands.selectOriginEndpoint)
    firstCommands.selectOriginEndpoint({ kind: 'venue', id: 'COM1' })
    expect(session.setTripEndpoint).toHaveBeenCalledWith('origin', { kind: 'venue', id: 'COM1' })

    const replacement = createSessionDouble()
    expect(adapter(replacement)).not.toBe(firstCommands)
  })
})

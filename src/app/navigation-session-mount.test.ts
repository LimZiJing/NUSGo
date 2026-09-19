import { describe, expect, it, vi } from 'vitest'
import type { LoadedTransitData } from './contracts/data'
import type { MapSession } from './contracts/map'
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

function createSessionDouble(): NavigationSession {
  return {
    getState: vi.fn(() => createInitialNavigationSessionState()),
    subscribe: vi.fn(() => () => undefined),
    start: vi.fn(async () => undefined),
    selectRoute: vi.fn(),
    setTripEndpoint: vi.fn(),
    clearTripEndpoint: vi.fn(),
    swapTripEndpoints: vi.fn(),
    clearTrip: vi.fn(),
    setOriginSearchQuery: vi.fn(),
    setDestinationSearchQuery: vi.fn(),
    setContextualPanelQuery: vi.fn(),
    selectVenue: vi.fn(),
    openVenueSearch: vi.fn(),
    openShuttle: vi.fn(),
    back: vi.fn(),
    escape: vi.fn(),
    close: vi.fn(),
    handleMapClick: vi.fn(),
    reportMapError: vi.fn(),
    dispose: vi.fn(),
  }
}

function createMountDependencies(
  map: MapSession,
  session: NavigationSession,
) {
  return {
    createMapSession: vi.fn(() => map),
    createNavigationSession: vi.fn(() => session),
    loadVenues: vi.fn(async () => ({ venues: {}, venueCount: 0 })),
    loadTransit: vi.fn(async () => new Promise<LoadedTransitData>(() => undefined)),
  }
}

describe('navigation session application seam', () => {
  it('installs one map/session pair per mount and disposes it on unmount', () => {
    const map = createMapDouble()
    const session = createSessionDouble()
    const dependencies = createMountDependencies(map, session)
    const container = {} as HTMLElement

    const mount = createNavigationSessionMount(container, dependencies)

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
    mount.dispose()
    expect(session.dispose).toHaveBeenCalledOnce()
  })

  it('keeps command callbacks stable for the mounted session', () => {
    const session = createSessionDouble()
    const adapter = createNavigationSessionCommandAdapter()

    const firstCommands = adapter(session)
    const secondCommands = adapter(session)

    expect(secondCommands).toBe(firstCommands)
    expect(secondCommands.setOriginSearchQuery).toBe(firstCommands.setOriginSearchQuery)
    firstCommands.setOriginSearchQuery('COM1')
    expect(session.setOriginSearchQuery).toHaveBeenCalledWith('COM1')

    const replacement = createSessionDouble()
    expect(adapter(replacement)).not.toBe(firstCommands)
  })
})

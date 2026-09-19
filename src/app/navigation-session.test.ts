import { describe, expect, it, vi } from 'vitest'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { TransitMapData } from './contracts'
import {
  createInitialNavigationSessionState,
  createNavigationSession,
  type NavigationSessionDependencies,
} from './navigation-session'

const geometry = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [[103, 1], [103.1, 1.1]] as [number, number][],
      },
    },
  ],
}

function createMapDouble() {
  return {
    ready: Promise.resolve(),
    loadTransitData: vi.fn(() => 2),
    setRouteSelection: vi.fn(),
    setTripRequest: vi.fn(),
    selectVenue: vi.fn(),
    clearVenue: vi.fn(),
    dispose: vi.fn(),
  }
}

function createDependencies(
  overrides: Partial<NavigationSessionDependencies> = {},
) {
  const network = createValidTransitNetwork()
  const transit: TransitMapData = { network, geometry }
  const map = createMapDouble()

  return {
    map,
    loadVenues: vi.fn(async () => ({
      venues: {
        COM1: {
          roomName: 'Computing 1',
          location: { x: 103, y: 1 },
        },
      },
      venueCount: 1,
    })),
    loadTransit: vi.fn(async () => transit),
    ...overrides,
  }
}

describe('navigation session', () => {
  it('starts with stable application defaults', () => {
    expect(createInitialNavigationSessionState()).toEqual({
      venues: null,
      transitNetwork: null,
      selectedRouteId: null,
      selectedRouteColor: null,
      tripRequest: { origin: null, destination: null },
      status: 'Loading map data…',
    })
  })

  it('loads validated data, indexes routes, and synchronizes the map', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    session.subscribe(listener)

    await session.start(new AbortController().signal)

    expect(session.getState()).toMatchObject({
      venues: { COM1: expect.any(Object) },
      transitNetwork: expect.any(Object),
      status: '1 venues · 2 shuttle stops · 1 shuttle routes loaded',
    })
    expect(dependencies.map.loadTransitData).toHaveBeenCalledOnce()
    expect(dependencies.map.setTripRequest).toHaveBeenCalled()
    expect(listener).toHaveBeenCalled()
  })

  it('coordinates route selection through the route index and map port', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    await session.start(new AbortController().signal)
    session.selectRoute('A1')

    expect(session.getState()).toMatchObject({
      selectedRouteId: 'A1',
      selectedRouteColor: '#123456',
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenCalledWith({
      route: expect.objectContaining({ id: 'A1' }),
      overlappingRouteIds: expect.any(Set),
    })

    session.selectRoute(null)
    expect(session.getState().selectedRouteId).toBeNull()
  })

  it('owns trip endpoint commands and forwards the resulting request to the map', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const endpoint = { kind: 'stop' as const, id: 'STOP-A' }

    await session.start(new AbortController().signal)
    session.setTripEndpoint('origin', endpoint)
    session.setTripEndpoint('destination', { kind: 'venue', id: 'COM1' })

    expect(session.getState().tripRequest).toEqual({
      origin: endpoint,
      destination: { kind: 'venue', id: 'COM1' },
    })
    expect(dependencies.map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      expect.objectContaining({ COM1: expect.any(Object) }),
      expect.any(Array),
    )

    session.swapTripEndpoints()
    expect(session.getState().tripRequest.origin).toEqual({ kind: 'venue', id: 'COM1' })
    session.clearTrip()
    expect(session.getState().tripRequest).toEqual({ origin: null, destination: null })
  })

  it('reports data and map failures through the session status', async () => {
    const dependencies = createDependencies({
      loadTransit: vi.fn(async () => {
        throw new Error('bad payload')
      }),
    })
    const session = createNavigationSession(dependencies)

    await session.start(new AbortController().signal)

    expect(session.getState().status).toBe('Unable to load shuttle route data')
    session.reportMapError(new Error('tile failure'))
    expect(session.getState().status).toBe('Unable to load map tiles')
  })

  it('disposes the map port and stops publishing state', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    session.subscribe(listener)
    session.dispose()

    session.reportMapError(new Error('late error'))

    expect(dependencies.map.dispose).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()
  })
})

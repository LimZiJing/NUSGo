import { describe, expect, it, vi } from 'vitest'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import { createTransitIndex } from '../domain/transit'
import type { VenueSearchResult } from '../domain/venue/search'
import type { LoadedTransitData } from './contracts/map'
import {
  createInitialNavigationSessionState,
  createNavigationSession,
  type LoadedVenueData,
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

function createMapDouble(ready: Promise<void> = Promise.resolve()) {
  return {
    ready,
    loadTransitData: vi.fn(),
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
  const index = createTransitIndex(createValidTransitNetwork())
  const transit: LoadedTransitData = {
    network: index.network,
    geometry,
    index,
  }
  const venues: LoadedVenueData = {
    venues: {
      COM1: {
        roomName: 'Computing 1',
        location: { x: 103, y: 1 },
      },
    },
    venueCount: 1,
  }
  const map = createMapDouble()

  return {
    map,
    venues,
    transit,
    loadVenues: vi.fn(async () => venues),
    loadTransit: vi.fn(async () => transit),
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const venueResult: VenueSearchResult = {
  code: 'COM1',
  venue: {
    roomName: 'Computing 1',
    location: { x: 103, y: 1 },
  },
}

describe('navigation session', () => {
  it('starts with stable application defaults', () => {
    expect(createInitialNavigationSessionState()).toEqual({
      venues: null,
      transitIndex: null,
      selectedRouteId: null,
      selectedRouteColor: null,
      contextualPanel: {
        mode: 'venue-search',
        query: '',
        selectedVenue: null,
        history: [],
      },
      tripRequest: { origin: null, destination: null },
      originSearchQuery: '',
      destinationSearchQuery: '',
      resourceStatus: {
        venue: { status: 'pending' },
        transit: { status: 'pending' },
      },
      mapError: null,
      status: 'Loading map data…',
    })
  })

  it('publishes commands and supports returned and explicit unsubscription', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    session.setOriginSearchQuery('COM1')
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    session.setDestinationSearchQuery('STOP')
    expect(listener).toHaveBeenCalledOnce()

    session.subscribe(listener)
    session.unsubscribe(listener)
    session.setContextualPanelQuery('venue')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('loads immutable data, reconciles route selection once, and synchronizes the map', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    await session.start(new AbortController().signal)

    expect(session.getState()).toMatchObject({
      venues: dependencies.venues.venues,
      transitIndex: dependencies.transit.index,
      status: '1 venues · 2 shuttle stops · 1 shuttle routes loaded',
    })
    expect(dependencies.map.loadTransitData).toHaveBeenCalledOnce()
    expect(dependencies.map.loadTransitData).toHaveBeenCalledWith(
      dependencies.transit,
      { route: null, overlappingRouteIds: expect.any(Set) },
      expect.any(Function),
    )
    expect(dependencies.map.setRouteSelection).not.toHaveBeenCalled()
    expect(dependencies.map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
  })

  it('preserves venue-first and transit-first completion behavior', async () => {
    const venueDeferred = createDeferred<LoadedVenueData>()
    const transitDeferred = createDeferred<LoadedTransitData>()
    const dependencies = createDependencies({
      loadVenues: vi.fn(() => venueDeferred.promise),
      loadTransit: vi.fn(() => transitDeferred.promise),
    })
    const session = createNavigationSession(dependencies)
    const start = session.start(new AbortController().signal)

    venueDeferred.resolve(dependencies.venues)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(session.getState().status).toBe('1 venues available; loading shuttle routes…')

    transitDeferred.resolve(dependencies.transit)
    await start
    expect(session.getState().status).toBe('1 venues · 2 shuttle stops · 1 shuttle routes loaded')

    const reverseVenue = createDeferred<LoadedVenueData>()
    const reverseTransit = createDeferred<LoadedTransitData>()
    const reverseDependencies = createDependencies({
      loadVenues: vi.fn(() => reverseVenue.promise),
      loadTransit: vi.fn(() => reverseTransit.promise),
    })
    const reverseSession = createNavigationSession(reverseDependencies)
    const reverseStart = reverseSession.start(new AbortController().signal)

    reverseTransit.resolve(reverseDependencies.transit)
    await new Promise((resolve) => setTimeout(resolve, 0))
    reverseVenue.resolve(reverseDependencies.venues)
    await reverseStart
    expect(reverseSession.getState().status).toBe('1 venues · 2 shuttle stops · 1 shuttle routes loaded')
  })

  it('aggregates independent and combined resource failures in completion order', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const venueFailure = createDependencies({
        loadVenues: vi.fn(async () => { throw new Error('venues unavailable') }),
      })
      const venueFailureSession = createNavigationSession(venueFailure)
      await venueFailureSession.start(new AbortController().signal)
      expect(venueFailureSession.getState().status).toBe(
        '2 shuttle stops · 1 shuttle routes loaded; Unable to load venue data',
      )

      const transitFailure = createDependencies({
        loadTransit: vi.fn(async () => { throw new Error('transit unavailable') }),
      })
      const transitFailureSession = createNavigationSession(transitFailure)
      await transitFailureSession.start(new AbortController().signal)
      expect(transitFailureSession.getState().status).toBe(
        '1 venues available; Unable to load shuttle route data',
      )

      const combined = createDependencies({
        loadVenues: vi.fn(async () => { throw new Error('venues unavailable') }),
        loadTransit: vi.fn(async () => { throw new Error('transit unavailable') }),
      })
      const combinedSession = createNavigationSession(combined)
      await combinedSession.start(new AbortController().signal)
      expect(combinedSession.getState().status).toBe(
        'Unable to load venue data; Unable to load shuttle route data',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('aggregates map failure before and after resource completion', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const dependencies = createDependencies()
      const session = createNavigationSession(dependencies)
      session.reportMapError(new Error('tiles unavailable'))

      await session.start(new AbortController().signal)

      expect(session.getState()).toMatchObject({
        mapError: 'Unable to load map tiles',
        status: 'Unable to load map tiles; 1 venues · 2 shuttle stops · 1 shuttle routes loaded',
        resourceStatus: {
          venue: { status: 'loaded', value: 1 },
          transit: { status: 'loaded', value: { stopCount: 2, routeCount: 1 } },
        },
      })

      const laterMapError = createNavigationSession(createDependencies())
      await laterMapError.start(new AbortController().signal)
      laterMapError.reportMapError(new Error('tiles unavailable'))
      expect(laterMapError.getState().status).toBe(
        'Unable to load map tiles; 1 venues · 2 shuttle stops · 1 shuttle routes loaded',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('keeps map, venue, and transit status deterministic for every completion order', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const eventOrders = [
        ['map', 'venue', 'transit'],
        ['map', 'transit', 'venue'],
        ['venue', 'map', 'transit'],
        ['venue', 'transit', 'map'],
        ['transit', 'map', 'venue'],
        ['transit', 'venue', 'map'],
      ] as const

      for (const eventOrder of eventOrders) {
        const venue = createDeferred<LoadedVenueData>()
        const transit = createDeferred<LoadedTransitData>()
        const dependencies = createDependencies({
          loadVenues: vi.fn(() => venue.promise),
          loadTransit: vi.fn(() => transit.promise),
        })
        const session = createNavigationSession(dependencies)
        const start = session.start(new AbortController().signal)

        for (const event of eventOrder) {
          if (event === 'map') {
            session.reportMapError(new Error('tiles unavailable'))
          } else if (event === 'venue') {
            venue.reject(new Error('venues unavailable'))
          } else {
            transit.reject(new Error('transit unavailable'))
          }
          await Promise.resolve()
        }

        await start
        expect(session.getState().status).toBe(
          'Unable to load map tiles; Unable to load venue data; Unable to load shuttle route data',
        )
      }
    } finally {
      consoleError.mockRestore()
    }
  })

  it('selects, clears, and rejects routes deterministically', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.selectRoute('A1')
    expect(session.getState()).toMatchObject({
      selectedRouteId: 'A1',
      selectedRouteColor: '#123456',
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: expect.objectContaining({ id: 'A1' }),
      overlappingRouteIds: expect.any(Set),
    })

    session.selectRoute(null)
    session.selectRoute('missing-route')
    expect(session.getState()).toMatchObject({
      selectedRouteId: null,
      selectedRouteColor: null,
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: null,
      overlappingRouteIds: expect.any(Set),
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenCalledTimes(3)
  })

  it('owns contextual panel history, venue selection, and map-click dismissal', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    session.setContextualPanelQuery('COM1')
    session.selectVenue(venueResult)
    expect(session.getState().contextualPanel).toMatchObject({
      mode: 'venue-detail',
      query: 'COM1',
      selectedVenue: venueResult,
    })
    expect(dependencies.map.selectVenue).toHaveBeenCalledWith(venueResult.venue)

    session.dispatchContextualPanel({ type: 'set-query', query: 'COM1-0210' })
    expect(session.getState().contextualPanel.query).toBe('COM1-0210')

    session.back()
    expect(session.getState().contextualPanel).toMatchObject({
      mode: 'venue-search',
      query: 'COM1',
      selectedVenue: null,
    })
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.openShuttle()
    expect(session.getState().contextualPanel.mode).toBe('shuttle')
    session.back()
    expect(session.getState().contextualPanel.mode).toBe('venue-search')

    session.selectVenue(venueResult)
    session.handleMapClick()
    expect(session.getState().contextualPanel.mode).toBe('neutral')
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(2)

    session.openVenueSearch()
    session.close()
    expect(session.getState().contextualPanel.mode).toBe('neutral')
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(3)
  })

  it('owns endpoint queries, trip commands, and map endpoint synchronization', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setOriginSearchQuery('COM')
    session.setDestinationSearchQuery('STOP')
    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })
    expect(session.getState()).toMatchObject({
      originSearchQuery: '',
      destinationSearchQuery: '',
      tripRequest: {
        origin: { kind: 'venue', id: 'COM1' },
        destination: { kind: 'stop', id: 'STOP-A' },
      },
    })

    session.swapTripEndpoints()
    expect(session.getState().tripRequest).toEqual({
      origin: { kind: 'stop', id: 'STOP-A' },
      destination: { kind: 'venue', id: 'COM1' },
    })
    session.clearTripEndpoint('origin')
    expect(session.getState().tripRequest.origin).toBeNull()
    session.clearTrip()
    expect(session.getState()).toMatchObject({
      tripRequest: { origin: null, destination: null },
      originSearchQuery: '',
      destinationSearchQuery: '',
    })
    expect(dependencies.map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
  })

  it('waits for map readiness before installing transit data', async () => {
    const mapReady = createDeferred<void>()
    const dependencies = createDependencies({ map: createMapDouble(mapReady.promise) })
    const session = createNavigationSession(dependencies)
    const start = session.start(new AbortController().signal)

    await Promise.resolve()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    mapReady.resolve()
    await start
    expect(dependencies.map.loadTransitData).toHaveBeenCalledOnce()
  })

  it('is single-shot and safe across abort, late completion, and idempotent disposal', async () => {
    const venueDeferred = createDeferred<LoadedVenueData>()
    const transitDeferred = createDeferred<LoadedTransitData>()
    const dependencies = createDependencies({
      loadVenues: vi.fn(() => venueDeferred.promise),
      loadTransit: vi.fn(() => transitDeferred.promise),
    })
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    session.subscribe(listener)
    const controller = new AbortController()
    const firstStart = session.start(controller.signal)
    const secondStart = session.start(new AbortController().signal)
    expect(secondStart).toBe(firstStart)

    controller.abort()
    session.dispose()
    session.dispose()
    venueDeferred.resolve(dependencies.venues)
    transitDeferred.resolve(dependencies.transit)
    await firstStart

    expect(dependencies.loadVenues).toHaveBeenCalledOnce()
    expect(dependencies.loadTransit).toHaveBeenCalledOnce()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    expect(dependencies.map.dispose).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()

    session.reportMapError(new Error('late map error'))
    expect(listener).not.toHaveBeenCalled()
  })
})

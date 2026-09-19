import { describe, expect, it, vi } from 'vitest'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import { createTransitIndex } from '../domain/transit'
import type { TripEndpointRole } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { LoadedTransitData } from './contracts/map'
import {
  createInitialNavigationSessionState,
  createNavigationSession,
  type LoadedVenueData,
  type NavigationSession,
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

async function waitForState(
  session: NavigationSession,
  predicate: (state: ReturnType<NavigationSession['getState']>) => boolean,
): Promise<void> {
  if (predicate(session.getState())) return

  await new Promise<void>((resolve) => {
    const unsubscribe = session.subscribe(() => {
      if (!predicate(session.getState())) return
      unsubscribe()
      resolve()
    })
  })
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

  it('publishes commands and supports returned subscription cleanup', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    const cleanup = session.subscribe(listener)

    session.setOriginSearchQuery('COM1')
    expect(listener).toHaveBeenCalledOnce()

    cleanup()
    session.setDestinationSearchQuery('STOP')
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

    const venueLoaded = waitForState(
      session,
      (state) => state.status === '1 venues available; loading shuttle routes…',
    )
    venueDeferred.resolve(dependencies.venues)
    await venueLoaded
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

    const transitLoaded = waitForState(
      reverseSession,
      (state) => state.status === '2 shuttle stops · 1 shuttle routes loaded; loading venue data…',
    )
    reverseTransit.resolve(reverseDependencies.transit)
    await transitLoaded
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

  it('formats every map and resource outcome with stable details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const scenarios = [
        [false, false, false, '1 venues · 2 shuttle stops · 1 shuttle routes loaded'],
        [false, false, true, '1 venues available; Unable to load shuttle route data'],
        [false, true, false, '2 shuttle stops · 1 shuttle routes loaded; Unable to load venue data'],
        [false, true, true, 'Unable to load venue data; Unable to load shuttle route data'],
        [true, false, false, 'Unable to load map tiles; 1 venues · 2 shuttle stops · 1 shuttle routes loaded'],
        [true, false, true, 'Unable to load map tiles; 1 venues available; Unable to load shuttle route data'],
        [true, true, false, 'Unable to load map tiles; 2 shuttle stops · 1 shuttle routes loaded; Unable to load venue data'],
        [true, true, true, 'Unable to load map tiles; Unable to load venue data; Unable to load shuttle route data'],
      ] as const

      for (const [mapFailed, venueFailed, transitFailed, expectedStatus] of scenarios) {
        const dependencies = createDependencies({
          loadVenues: vi.fn(async () => {
            if (venueFailed) throw new Error('venues unavailable')
            return dependencies.venues
          }),
          loadTransit: vi.fn(async () => {
            if (transitFailed) throw new Error('transit unavailable')
            return dependencies.transit
          }),
        })
        const session = createNavigationSession(dependencies)
        if (mapFailed) session.reportMapError(new Error('tiles unavailable'))
        await session.start(new AbortController().signal)
        expect(session.getState().status).toBe(expectedStatus)
      }
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
            const venueFailed = waitForState(
              session,
              (state) => state.resourceStatus.venue.status === 'failed',
            )
            venue.reject(new Error('venues unavailable'))
            await venueFailed
          } else {
            const transitFailed = waitForState(
              session,
              (state) => state.resourceStatus.transit.status === 'failed',
            )
            transit.reject(new Error('transit unavailable'))
            await transitFailed
          }
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

  it('rejects unknown, unmapped, and malformed endpoint commands', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    const stateBefore = session.getState()
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    const mapCallCount = map.setTripRequest.mock.calls.length

    session.setTripEndpoint('origin', { kind: 'venue', id: 'MISSING' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'MISSING' })
    session.setTripEndpoint('origin', { kind: 'venue', id: ' ' })
    session.setTripEndpoint('invalid' as unknown as TripEndpointRole, { kind: 'venue', id: 'COM1' })
    session.clearTripEndpoint('invalid' as unknown as TripEndpointRole)

    expect(session.getState()).toBe(stateBefore)
    expect(map.setTripRequest).toHaveBeenCalledTimes(mapCallCount)

    const unmappedData: LoadedVenueData = {
      venues: {
        UNMAPPED: { roomName: 'Unmapped venue' },
      },
      venueCount: 0,
    }
    const unmappedDependencies = createDependencies({
      loadVenues: vi.fn(async () => unmappedData),
    })
    const unmappedSession = createNavigationSession(unmappedDependencies)
    await unmappedSession.start(new AbortController().signal)
    const unmappedStateBefore = unmappedSession.getState()
    const unmappedMap = unmappedDependencies.map as ReturnType<typeof createMapDouble>
    const unmappedMapCallCount = unmappedMap.setTripRequest.mock.calls.length
    unmappedSession.setTripEndpoint('origin', { kind: 'venue', id: 'UNMAPPED' })
    expect(unmappedSession.getState()).toBe(unmappedStateBefore)
    expect(unmappedMap.setTripRequest).toHaveBeenCalledTimes(unmappedMapCallCount)
  })

  it('publishes immutable controller-owned snapshots without cloning canonical loaded values', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const loadedState = session.getState()
    expect(loadedState.venues).toBe(dependencies.venues.venues)
    expect(loadedState.transitIndex).toBe(dependencies.transit.index)
    expect(Object.isFrozen(loadedState)).toBe(true)
    expect(Object.isFrozen(loadedState.contextualPanel)).toBe(true)
    expect(Object.isFrozen(loadedState.contextualPanel.history)).toBe(true)
    expect(Object.isFrozen(loadedState.tripRequest)).toBe(true)
    expect(Object.isFrozen(loadedState.resourceStatus)).toBe(true)

    const endpoint = { kind: 'venue' as const, id: 'COM1' }
    session.setTripEndpoint('origin', endpoint)
    expect(endpoint).toEqual({ kind: 'venue', id: 'COM1' })
    expect(Object.isFrozen(session.getState().tripRequest.origin)).toBe(true)
    expect(session.getState().tripRequest.origin).not.toBe(endpoint)

    session.selectVenue(venueResult)
    const selectedVenue = session.getState().contextualPanel.selectedVenue
    expect(selectedVenue?.venue).toBe(dependencies.venues.venues.COM1)
    expect(Object.isFrozen(selectedVenue)).toBe(true)
    expect(Object.isFrozen(session.getState().contextualPanel.history)).toBe(true)
  })

  it('canonicalizes venue selection by loaded code and rejects mismatched or unmapped results', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    const stateBefore = session.getState()

    session.selectVenue({
      code: 'COM1',
      venue: { roomName: 'Wrong venue', location: { x: 104, y: 2 } },
    })
    session.selectVenue({
      code: 'MISSING',
      venue: venueResult.venue,
    })

    expect(session.getState()).toBe(stateBefore)
    expect(dependencies.map.selectVenue).not.toHaveBeenCalled()

    session.selectVenue(venueResult)
    expect(session.getState().contextualPanel.selectedVenue).toEqual({
      code: 'COM1',
      venue: dependencies.venues.venues.COM1,
    })
    expect(dependencies.map.selectVenue).toHaveBeenCalledOnce()
    expect(dependencies.map.selectVenue).toHaveBeenCalledWith(dependencies.venues.venues.COM1)

    const unmappedData: LoadedVenueData = {
      venues: {
        UNMAPPED: { roomName: 'Unmapped venue' },
      },
      venueCount: 1,
    }
    const unmappedDependencies = createDependencies({
      loadVenues: vi.fn(async () => unmappedData),
    })
    const unmappedSession = createNavigationSession(unmappedDependencies)
    await unmappedSession.start(new AbortController().signal)
    unmappedSession.selectVenue({
      code: 'UNMAPPED',
      venue: { roomName: 'Unmapped venue', location: { x: 103, y: 1 } },
    })
    expect(unmappedSession.getState().contextualPanel.selectedVenue).toBeNull()
    expect(unmappedDependencies.map.selectVenue).not.toHaveBeenCalled()
  })

  it('owns contextual panel history, venue selection, and map-click dismissal', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setContextualPanelQuery('COM1')
    session.selectVenue(venueResult)
    expect(session.getState().contextualPanel).toMatchObject({
      mode: 'venue-detail',
      query: 'COM1',
      selectedVenue: venueResult,
    })
    expect(dependencies.map.selectVenue).toHaveBeenCalledWith(venueResult.venue)

    session.setContextualPanelQuery('COM1-0210')
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

  it('escapes through panel history while retaining venue marker context', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.selectVenue(venueResult)
    session.escape()
    expect(session.getState().contextualPanel.mode).toBe('venue-search')
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.selectVenue(venueResult)
    session.openShuttle()
    session.escape()
    expect(session.getState().contextualPanel.mode).toBe('venue-detail')
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.close()
    expect(session.getState().contextualPanel.mode).toBe('neutral')
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(2)
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

  it('does not invoke loaders when startup is already aborted', async () => {
    const dependencies = createDependencies()
    const controller = new AbortController()
    controller.abort()
    const session = createNavigationSession(dependencies)

    await session.start(controller.signal)

    expect(dependencies.loadVenues).not.toHaveBeenCalled()
    expect(dependencies.loadTransit).not.toHaveBeenCalled()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    expect(session.getState()).toEqual(createInitialNavigationSessionState())
  })

  it('owns startup cancellation and removes the external listener after settlement', async () => {
    const venue = createDeferred<LoadedVenueData>()
    const transit = createDeferred<LoadedTransitData>()
    const loadVenues = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return venue.promise
    })
    const loadTransit = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return transit.promise
    })
    const dependencies = createDependencies({
      loadVenues,
      loadTransit,
    })
    const session = createNavigationSession(dependencies)
    const externalController = new AbortController()
    const start = session.start(externalController.signal)

    await Promise.resolve()
    const venueSignal = loadVenues.mock.calls[0]?.[0]
    const transitSignal = loadTransit.mock.calls[0]?.[0]
    expect(venueSignal).toBeDefined()
    expect(transitSignal).toBe(venueSignal)
    expect(venueSignal?.aborted).toBe(false)

    venue.resolve(dependencies.venues)
    transit.resolve(dependencies.transit)
    await start
    externalController.abort()
    expect(venueSignal?.aborted).toBe(false)
    expect(transitSignal?.aborted).toBe(false)

    session.dispose()
    expect(venueSignal?.aborted).toBe(true)
    expect(transitSignal?.aborted).toBe(true)
  })

  it('propagates external abort to both loaders and keeps late results inert', async () => {
    const venue = createDeferred<LoadedVenueData>()
    const transit = createDeferred<LoadedTransitData>()
    const loadVenues = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return venue.promise
    })
    const loadTransit = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return transit.promise
    })
    const dependencies = createDependencies({
      loadVenues,
      loadTransit,
    })
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    session.subscribe(listener)
    const externalController = new AbortController()
    const start = session.start(externalController.signal)

    await Promise.resolve()
    const venueSignal = loadVenues.mock.calls[0]?.[0]
    const transitSignal = loadTransit.mock.calls[0]?.[0]
    externalController.abort()
    expect(venueSignal?.aborted).toBe(true)
    expect(transitSignal?.aborted).toBe(true)

    venue.resolve(dependencies.venues)
    transit.resolve(dependencies.transit)
    await start

    expect(session.getState().venues).toBeNull()
    expect(session.getState().transitIndex).toBeNull()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  it('aborts both loader signals exactly once when disposed while loading', async () => {
    const venue = createDeferred<LoadedVenueData>()
    const transit = createDeferred<LoadedTransitData>()
    const loadVenues = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return venue.promise
    })
    const loadTransit = vi.fn((signal: AbortSignal) => {
      expect(signal).toBeDefined()
      return transit.promise
    })
    const dependencies = createDependencies({
      loadVenues,
      loadTransit,
    })
    const session = createNavigationSession(dependencies)
    const start = session.start(new AbortController().signal)

    await Promise.resolve()
    const venueSignal = loadVenues.mock.calls[0]?.[0]
    const transitSignal = loadTransit.mock.calls[0]?.[0]
    session.dispose()
    session.dispose()

    expect(venueSignal?.aborted).toBe(true)
    expect(transitSignal?.aborted).toBe(true)
    expect(dependencies.map.dispose).toHaveBeenCalledOnce()

    venue.resolve(dependencies.venues)
    transit.resolve(dependencies.transit)
    await start
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
  })
})

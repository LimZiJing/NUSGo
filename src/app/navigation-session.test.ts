import { describe, expect, it, vi } from 'vitest'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import { createTransitIndex, generateShuttleTimingData } from '../domain/transit'
import type { TripEndpoint, TripEndpointRole } from '../domain/trip/types'
import type { Journey } from '../domain/trip/journey'
import type { VenueSearchResult } from '../domain/venue/search'
import { validateVenueLocationMap } from '../domain/venue/validation'
import type { LoadedTransitData, LoadedVenueData } from './contracts/data'
import type { LocationTracker } from './contracts/location'
import {
  INITIAL_LOCATION_TRACKING_STATE,
  type LocationTrackingState,
} from '../domain/location/types'
import {
  createInitialNavigationSessionState,
  createNavigationSession,
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
    refitRoute: vi.fn(),
    focusStop: vi.fn(),
    setTripRequest: vi.fn(),
    setJourney: vi.fn(),
    setViewportInsets: vi.fn(),
    dismissPopup: vi.fn(() => false),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetView: vi.fn(),
    selectVenue: vi.fn(),
    clearVenue: vi.fn(),
    dispose: vi.fn(),
  }
}

function createLocationTrackerDouble(): LocationTracker & {
  emit(state: LocationTrackingState): void
} {
  let state = INITIAL_LOCATION_TRACKING_STATE
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    enable: vi.fn(),
    disable: vi.fn(),
    dispose: vi.fn(),
    emit(nextState) {
      state = nextState
      for (const listener of listeners) listener()
    },
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
    shuttleTiming: generateShuttleTimingData(index.network, geometry, '2026-09-22'),
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
  const locationTracker = createLocationTrackerDouble()

  return {
    map,
    locationTracker,
    venues,
    transit,
    loadVenues: vi.fn(async () => venues),
    loadTransit: vi.fn(async () => transit),
    ...overrides,
  }
}

function createTwoRouteTransit(): LoadedTransitData {
  const network = createValidTransitNetwork()
  const index = createTransitIndex({
    ...network,
    routes: [
      ...network.routes,
      { id: 'B1', name: 'B1', color: '#654321', stopIds: ['STOP-B', 'STOP-A'] },
    ],
  })
  return {
    network: index.network,
    geometry,
    index,
    shuttleTiming: generateShuttleTimingData(index.network, geometry, '2026-09-22'),
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

function createJourney(destination: TripEndpoint): Journey {
  return {
    origin: { kind: 'venue', id: 'COM1' },
    destination,
    legs: [{
      mode: 'walking',
      from: { kind: 'venue', id: 'COM1' },
      to: destination,
      durationSeconds: 60,
      distanceMeters: 100,
      geometry: {
        type: 'LineString',
        coordinates: [[103, 1], [103.001, 1.001]],
      },
    }],
    totalDurationSeconds: 60,
    totalDistanceMeters: 100,
    estimateStatus: 'estimated',
  }
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
      rememberedMobileRouteId: null,
      contextualPanel: {
        mode: 'neutral',
        query: '',
        selectedVenue: null,
        history: [],
      },
      tripRequest: { origin: null, destination: null },
      journey: { status: 'idle', journey: null, error: null },
      location: { status: 'disabled', latestFix: null },
      resourceStatus: {
        venue: { status: 'pending' },
        transit: { status: 'pending' },
      },
      mapError: null,
      startupFailure: null,
      status: 'Loading map data…',
    })
  })

  it('publishes commands and supports returned subscription cleanup', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    const cleanup = session.subscribe(listener)

    session.setContextualPanelQuery('COM1')
    expect(listener).toHaveBeenCalledOnce()

    cleanup()
    session.setContextualPanelQuery('STOP')
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

  it('publishes Journey loading and ready states for complete endpoints', async () => {
    const planning = createDeferred<Journey | null>()
    const journeyPlanner = vi.fn(() => planning.promise)
    const dependencies = createDependencies({ journeyPlanner })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })

    expect(session.getState().journey).toEqual({
      status: 'loading',
      journey: null,
      error: null,
    })
    const journey = createJourney({ kind: 'stop', id: 'STOP-A' })
    planning.resolve(journey)
    await waitForState(session, (state) => state.journey.status === 'ready')

    expect(session.getState().journey).toMatchObject({
      status: 'ready',
      journey,
      error: null,
    })
    expect(dependencies.map.setJourney).toHaveBeenLastCalledWith(journey)
    expect(Object.isFrozen(session.getState().journey.journey)).toBe(true)
    expect(Object.isFrozen(session.getState().journey.journey?.legs[0])).toBe(true)
  })

  it('publishes a safe failure state when planning fails', async () => {
    const journeyPlanner = vi.fn(async () => {
      throw new Error('routing service unavailable')
    })
    const dependencies = createDependencies({ journeyPlanner })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })
    await waitForState(session, (state) => state.journey.status === 'failed')

    expect(session.getState().journey).toEqual({
      status: 'failed',
      journey: null,
      error: 'Unable to plan journey',
    })
  })

  it('ignores stale Journey results and clears the current Journey when an endpoint is cleared', async () => {
    const firstPlanning = createDeferred<Journey | null>()
    const secondPlanning = createDeferred<Journey | null>()
    const journeyPlanner = vi.fn()
      .mockImplementationOnce(() => firstPlanning.promise)
      .mockImplementationOnce(() => secondPlanning.promise)
    const dependencies = createDependencies({ journeyPlanner })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })
    const firstSignal = journeyPlanner.mock.calls[0]?.[0].signal as AbortSignal
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-B' })
    expect(firstSignal.aborted).toBe(true)

    const secondJourney = createJourney({ kind: 'stop', id: 'STOP-B' })
    secondPlanning.resolve(secondJourney)
    await waitForState(session, (state) => state.journey.status === 'ready')
    firstPlanning.resolve(createJourney({ kind: 'stop', id: 'STOP-A' }))
    await Promise.resolve()

    expect(session.getState().journey.journey?.destination).toEqual({ kind: 'stop', id: 'STOP-B' })
    session.clearTripEndpoint('destination')
    expect(session.getState().journey).toEqual({
      status: 'idle',
      journey: null,
      error: null,
    })
    expect(dependencies.map.setJourney).toHaveBeenLastCalledWith(null)
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

  it('remembers a mobile route while clearing and restoring its map selection', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.enterMobileRoutes()
    expect(session.getState()).toMatchObject({
      selectedRouteId: 'A1',
      rememberedMobileRouteId: 'A1',
      contextualPanel: { mode: 'shuttle' },
    })

    session.selectMobileRoute('A1')
    expect(dependencies.map.refitRoute).toHaveBeenCalledOnce()
    session.focusStop('STOP-A')
    expect(dependencies.map.focusStop).toHaveBeenCalledWith('STOP-A')
    session.focusStop('unknown')
    expect(dependencies.map.focusStop).toHaveBeenCalledOnce()

    session.suspendMobileRoutes()
    expect(session.getState()).toMatchObject({
      selectedRouteId: null,
      rememberedMobileRouteId: 'A1',
      contextualPanel: { mode: 'shuttle' },
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: null,
      overlappingRouteIds: expect.any(Set),
    }, false)

    session.enterMobileRoutes()
    expect(session.getState().selectedRouteId).toBe('A1')
    session.leaveMobileRoutes()
    expect(session.getState()).toMatchObject({
      selectedRouteId: null,
      rememberedMobileRouteId: 'A1',
      contextualPanel: { mode: 'neutral' },
    })
  })

  it('selects the first canonical route when mobile Routes opens before transit loads', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    session.enterMobileRoutes()
    expect(session.getState().selectedRouteId).toBeNull()
    await session.start(new AbortController().signal)

    expect(session.getState()).toMatchObject({
      selectedRouteId: 'A1',
      rememberedMobileRouteId: 'A1',
    })
  })

  it('keeps the final route selection aligned after a reentrant notification', async () => {
    const transit = createTwoRouteTransit()
    const dependencies = createDependencies({
      loadTransit: vi.fn(async () => transit),
    })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    let redirected = false
    session.subscribe(() => {
      if (!redirected && session.getState().selectedRouteId === 'A1') {
        redirected = true
        session.selectRoute('B1')
      }
    })

    session.selectRoute('A1')

    expect(session.getState()).toMatchObject({
      selectedRouteId: 'B1',
      selectedRouteColor: '#654321',
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: expect.objectContaining({ id: 'B1' }),
      overlappingRouteIds: expect.any(Set),
    })
  })

  it('serializes reentrant route transitions for a stable subscriber snapshot', async () => {
    const dependencies = createDependencies({
      loadTransit: vi.fn(async () => createTwoRouteTransit()),
    })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const events: string[] = []
    let redirected = false
    session.subscribe(() => {
      events.push(`first:${session.getState().selectedRouteId ?? 'none'}`)
      if (!redirected && session.getState().selectedRouteId === 'A1') {
        redirected = true
        session.selectRoute('B1')
      }
    })
    session.subscribe(() => {
      events.push(`second:${session.getState().selectedRouteId ?? 'none'}`)
    })

    session.selectRoute('A1')

    expect(events).toEqual([
      'first:A1',
      'second:A1',
      'first:B1',
      'second:B1',
    ])
    expect(session.getState()).toMatchObject({
      selectedRouteId: 'B1',
      selectedRouteColor: '#654321',
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: expect.objectContaining({ id: 'B1' }),
      overlappingRouteIds: expect.any(Set),
    })
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
    const canonicalVenues = validateVenueLocationMap({
      COM1: {
        roomName: 'Computing 1',
        location: { x: 103, y: 1 },
      },
    })
    const dependencies = createDependencies({
      loadVenues: vi.fn(async () => ({ venues: canonicalVenues, venueCount: 1 })),
    })
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const loadedState = session.getState()
    expect(loadedState.venues).toBe(canonicalVenues)
    expect(Object.isFrozen(loadedState.venues)).toBe(true)
    expect(Object.isFrozen(canonicalVenues.COM1)).toBe(true)
    expect(Object.isFrozen(canonicalVenues.COM1.location)).toBe(true)
    expect(loadedState.transitIndex).toBe(dependencies.transit.index)
    expect(Object.isFrozen(loadedState.transitIndex)).toBe(true)
    expect(Object.isFrozen(loadedState)).toBe(true)
    expect(Object.isFrozen(loadedState.contextualPanel)).toBe(true)
    expect(Object.isFrozen(loadedState.contextualPanel.history)).toBe(true)
    expect(Object.isFrozen(loadedState.tripRequest)).toBe(true)
    expect(Object.isFrozen(loadedState.resourceStatus)).toBe(true)
    expect(Object.isFrozen(loadedState.resourceStatus.venue)).toBe(true)
    expect(Object.isFrozen(loadedState.resourceStatus.transit)).toBe(true)
    if (loadedState.resourceStatus.transit.status === 'loaded') {
      expect(Object.isFrozen(loadedState.resourceStatus.transit.value)).toBe(true)
    }

    const originEndpoint = { kind: 'venue' as const, id: 'COM1' }
    const destinationEndpoint = { kind: 'stop' as const, id: 'STOP-A' }
    session.setTripEndpoint('origin', originEndpoint)
    session.setTripEndpoint('destination', destinationEndpoint)
    expect(originEndpoint).toEqual({ kind: 'venue', id: 'COM1' })
    expect(destinationEndpoint).toEqual({ kind: 'stop', id: 'STOP-A' })
    expect(Object.isFrozen(session.getState().tripRequest)).toBe(true)
    expect(Object.isFrozen(session.getState().tripRequest.origin)).toBe(true)
    expect(Object.isFrozen(session.getState().tripRequest.destination)).toBe(true)
    expect(session.getState().tripRequest.origin).not.toBe(originEndpoint)
    expect(session.getState().tripRequest.destination).not.toBe(destinationEndpoint)

    session.selectVenue({ code: 'COM1', venue: canonicalVenues.COM1 })
    session.selectVenue({ code: 'COM1', venue: canonicalVenues.COM1 })
    const selectedVenue = session.getState().contextualPanel.selectedVenue
    expect(selectedVenue?.venue).toBe(canonicalVenues.COM1)
    expect(Object.isFrozen(selectedVenue)).toBe(true)
    expect(Object.isFrozen(selectedVenue?.venue)).toBe(true)
    expect(Object.isFrozen(session.getState().contextualPanel.history)).toBe(true)
    expect(session.getState().contextualPanel.history).toHaveLength(2)
    expect(session.getState().contextualPanel.history.every((entry) => Object.isFrozen(entry))).toBe(true)
    expect(Object.isFrozen(session.getState().contextualPanel.history[1]?.selectedVenue)).toBe(true)
    expect(session.getState().contextualPanel.history[1]?.selectedVenue?.venue).toBe(canonicalVenues.COM1)
  })

  it('freezes pending and failed resource branches', async () => {
    const initialState = createInitialNavigationSessionState()
    expect(Object.isFrozen(initialState.resourceStatus.venue)).toBe(true)
    expect(Object.isFrozen(initialState.resourceStatus.transit)).toBe(true)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const dependencies = createDependencies({
        loadTransit: vi.fn(async () => {
          throw new Error('transit unavailable')
        }),
      })
      const session = createNavigationSession(dependencies)
      await session.start(new AbortController().signal)

      expect(Object.isFrozen(session.getState().resourceStatus.venue)).toBe(true)
      expect(Object.isFrozen(session.getState().resourceStatus.transit)).toBe(true)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('canonicalizes venue selection by loaded code and permits matching venues without coordinates', async () => {
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

    unmappedSession.selectVenue({
      code: 'UNMAPPED',
      venue: unmappedData.venues.UNMAPPED,
    })
    expect(unmappedSession.getState().contextualPanel.selectedVenue).toEqual({
      code: 'UNMAPPED',
      venue: unmappedData.venues.UNMAPPED,
    })
    expect(unmappedDependencies.map.selectVenue).toHaveBeenCalledWith(unmappedData.venues.UNMAPPED)
  })

  it('selects the venue before notifying a subscriber that disposes the session', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const events: string[] = []
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    map.selectVenue.mockImplementation(() => {
      events.push('map')
    })
    session.subscribe(() => {
      events.push('notify')
      session.dispose()
    })

    session.selectVenue(venueResult)

    expect(events).toEqual(['map', 'notify'])
  })

  it('owns contextual panel history, venue selection, and map-click dismissal', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.openVenueSearch()
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

  it('opens a nearby stop while preserving the venue-details return path', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.openVenueSearch()
    session.selectVenue(venueResult)
    const history = session.getState().contextualPanel.history

    session.focusStop('STOP-A')

    expect(dependencies.map.focusStop).toHaveBeenCalledWith('STOP-A')
    expect(session.getState().contextualPanel).toMatchObject({
      mode: 'venue-detail',
      selectedVenue: venueResult,
      history,
    })
    session.back()
    expect(session.getState().contextualPanel.mode).toBe('venue-search')
  })

  it('clears the selected route when closing the shuttle panel', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.openShuttle()
    session.selectRoute('A1')
    expect(session.getState()).toMatchObject({
      selectedRouteId: 'A1',
      selectedRouteColor: '#123456',
    })

    session.close()

    expect(session.getState()).toMatchObject({
      contextualPanel: { mode: 'neutral' },
      selectedRouteId: null,
      selectedRouteColor: null,
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: null,
      overlappingRouteIds: expect.any(Set),
    })
  })

  it('returns to the mobile tab root without clearing map context or trip endpoints', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.selectVenue(venueResult)
    session.selectRoute('A1')
    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })

    session.closeToRoot()

    expect(session.getState()).toMatchObject({
      contextualPanel: {
        mode: 'neutral',
        selectedVenue: venueResult,
        history: [],
      },
      selectedRouteId: 'A1',
      tripRequest: {
        origin: { kind: 'venue', id: 'COM1' },
        destination: { kind: 'stop', id: 'STOP-A' },
      },
    })
    expect(dependencies.map.clearVenue).not.toHaveBeenCalled()
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: expect.objectContaining({ id: 'A1' }),
      overlappingRouteIds: expect.any(Set),
    })
  })

  it('backs from route details to route choices and preserves map selection on Close', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.closeToRoot()
    session.openShuttle()
    session.selectRoute('A1')
    session.openShuttleRouteDetail()
    expect(session.getState()).toMatchObject({
      contextualPanel: { mode: 'shuttle-route-detail' },
      selectedRouteId: 'A1',
    })

    session.back()
    expect(session.getState()).toMatchObject({
      contextualPanel: { mode: 'shuttle' },
      selectedRouteId: 'A1',
    })

    session.openShuttleRouteDetail()
    session.closeToRoot()
    expect(session.getState()).toMatchObject({
      contextualPanel: { mode: 'neutral', history: [] },
      selectedRouteId: 'A1',
    })
    expect(dependencies.map.setRouteSelection).toHaveBeenLastCalledWith({
      route: expect.objectContaining({ id: 'A1' }),
      overlappingRouteIds: expect.any(Set),
    })
  })

  it('escapes through panel history while retaining venue marker context', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.openVenueSearch()
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

  it('clears venue markers on Back only when leaving venue detail', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.back()
    expect(dependencies.map.clearVenue).not.toHaveBeenCalled()

    session.openShuttle()
    session.back()
    expect(dependencies.map.clearVenue).not.toHaveBeenCalled()

    session.selectVenue(venueResult)
    session.back()
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.selectVenue(venueResult)
    session.selectVenue(venueResult)
    session.back()
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()
    session.back()
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(2)

    session.close()
    session.back()
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(3)
  })

  it('keeps Escape clearing its no-history and detail-leaving cases', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.escape()
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.openShuttle()
    session.escape()
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.selectVenue(venueResult)
    session.openShuttle()
    session.escape()
    expect(session.getState().contextualPanel.mode).toBe('venue-detail')
    expect(dependencies.map.clearVenue).toHaveBeenCalledOnce()

    session.escape()
    expect(session.getState().contextualPanel.mode).toBe('neutral')
    expect(dependencies.map.clearVenue).toHaveBeenCalledTimes(2)
  })

  it('owns trip commands and map endpoint synchronization', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })
    expect(session.getState()).toMatchObject({
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
    })
    expect(dependencies.map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
  })

  it('replaces the destination with a venue while preserving the origin', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    session.setTripEndpoint('origin', { kind: 'stop', id: 'STOP-A' })
    session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-B' })
    session.setTripEndpoint('destination', { kind: 'venue', id: 'COM1' })

    expect(session.getState().tripRequest).toEqual({
      origin: { kind: 'stop', id: 'STOP-A' },
      destination: { kind: 'venue', id: 'COM1' },
    })
    expect(dependencies.map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
  })

  it('keeps caller endpoint mutation out of state and map synchronization', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const endpoint: { kind: 'venue'; id: string } = { kind: 'venue', id: 'COM1' }
    session.setTripEndpoint('origin', endpoint)
    endpoint.id = 'MUTATED'

    const request = session.getState().tripRequest
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    expect(request).toEqual({ origin: { kind: 'venue', id: 'COM1' }, destination: null })
    expect(map.setTripRequest).toHaveBeenLastCalledWith(
      request,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
    expect(map.setTripRequest.mock.lastCall?.[0]).toBe(request)
  })

  it('synchronizes a trip request before a subscriber can clear its endpoint', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const events: string[] = []
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    map.setTripRequest.mockImplementation((request) => {
      events.push(`map:${request.origin?.id ?? 'none'}`)
    })
    let cleared = false
    session.subscribe(() => {
      events.push('notify')
      if (!cleared && session.getState().tripRequest.origin?.id === 'COM1') {
        cleared = true
        session.clearTripEndpoint('origin')
      }
    })

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })

    expect(session.getState().tripRequest.origin).toBeNull()
    expect(events).toEqual(['map:COM1', 'notify', 'map:none', 'notify'])
    expect(map.setTripRequest).toHaveBeenLastCalledWith(
      session.getState().tripRequest,
      dependencies.venues.venues,
      dependencies.transit.index,
    )
  })

  it('serializes reentrant trip endpoint transitions for every subscriber', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)

    const events: string[] = []
    let selectedDestination = false
    session.subscribe(() => {
      const request = session.getState().tripRequest
      events.push(`first:${request.origin?.id ?? 'none'}>${request.destination?.id ?? 'none'}`)
      if (!selectedDestination && request.origin?.id === 'COM1') {
        selectedDestination = true
        session.setTripEndpoint('destination', { kind: 'stop', id: 'STOP-A' })
      }
    })
    session.subscribe(() => {
      const request = session.getState().tripRequest
      events.push(`second:${request.origin?.id ?? 'none'}>${request.destination?.id ?? 'none'}`)
    })

    session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' })

    expect(events).toEqual([
      'first:COM1>none',
      'second:COM1>none',
      'first:COM1>STOP-A',
      'second:COM1>STOP-A',
    ])
    expect(session.getState().tripRequest).toEqual({
      origin: { kind: 'venue', id: 'COM1' },
      destination: { kind: 'stop', id: 'STOP-A' },
    })
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    expect(map.setTripRequest.mock.lastCall?.[0]).toBe(session.getState().tripRequest)
  })

  it('stops notification and queued work when a subscriber disposes the session', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    map.setTripRequest.mockClear()
    const events: string[] = []

    session.subscribe(() => {
      events.push('first')
      session.setContextualPanelQuery('queued')
      session.dispose()
    })
    session.subscribe(() => {
      events.push('second')
    })

    session.setContextualPanelQuery('COM1')

    expect(events).toEqual(['first'])
    expect(map.setTripRequest).not.toHaveBeenCalled()
    expect(map.dispose).toHaveBeenCalledOnce()
    expect(session.getState().contextualPanel.query).toBe('COM1')
  })

  it('synchronizes loaded transit resources before a subscriber can dispose the session', async () => {
    const venue = createDeferred<LoadedVenueData>()
    const transit = createDeferred<LoadedTransitData>()
    const dependencies = createDependencies({
      loadVenues: vi.fn(() => venue.promise),
      loadTransit: vi.fn(() => transit.promise),
    })
    const session = createNavigationSession(dependencies)
    const events: string[] = []
    const venueLoaded = createDeferred<void>()
    let venueNotified = false
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    map.setTripRequest.mockImplementation(() => {
      events.push('trip-map')
    })
    map.loadTransitData.mockImplementation(() => {
      events.push('transit-map')
    })
    session.subscribe(() => {
      if (
        !venueNotified &&
        session.getState().resourceStatus.venue.status === 'loaded'
      ) {
        venueNotified = true
        events.push('venue-notify')
        venueLoaded.resolve()
      }
      if (session.getState().resourceStatus.transit.status === 'loaded') {
        events.push('transit-notify')
        session.dispose()
      }
    })

    const start = session.start(new AbortController().signal)
    venue.resolve(dependencies.venues)
    await venueLoaded.promise
    transit.resolve(dependencies.transit)
    await start

    expect(events).toEqual([
      'trip-map',
      'venue-notify',
      'transit-map',
      'trip-map',
      'transit-notify',
    ])
  })

  it('propagates map and subscriber failures from venue and transit completion', async () => {
    const createPendingSession = () => {
      const venue = createDeferred<LoadedVenueData>()
      const transit = createDeferred<LoadedTransitData>()
      const dependencies = createDependencies({
        loadVenues: vi.fn(() => venue.promise),
        loadTransit: vi.fn(() => transit.promise),
      })
      const session = createNavigationSession(dependencies)
      const start = session.start(new AbortController().signal)
      return { venue, transit, dependencies, session, start }
    }

    {
      const { venue, transit, dependencies, session, start } = createPendingSession()
      const map = dependencies.map as ReturnType<typeof createMapDouble>
      map.setTripRequest.mockImplementation(() => {
        throw new Error('venue map synchronization failed')
      })
      venue.resolve(dependencies.venues)

      await expect(start).rejects.toThrow('venue map synchronization failed')
      expect(session.getState().status).toBe('Loading map data…')
      expect(map.setTripRequest).toHaveBeenCalledOnce()
      session.dispose()
      transit.resolve(dependencies.transit)
    }

    {
      const { venue, transit, dependencies, session, start } = createPendingSession()
      const map = dependencies.map as ReturnType<typeof createMapDouble>
      map.loadTransitData.mockImplementation(() => {
        throw new Error('transit map installation failed')
      })
      venue.resolve(dependencies.venues)
      await waitForState(
        session,
        (state) => state.resourceStatus.venue.status === 'loaded',
      )
      transit.resolve(dependencies.transit)

      await expect(start).rejects.toThrow('transit map installation failed')
      expect(session.getState().status).toBe(
        '1 venues available; loading shuttle routes…',
      )
      expect(map.loadTransitData).toHaveBeenCalledOnce()
      session.dispose()
    }

    {
      const { venue, transit, dependencies, session, start } = createPendingSession()
      const map = dependencies.map as ReturnType<typeof createMapDouble>
      map.setTripRequest
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new Error('transit endpoint synchronization failed')
        })
      venue.resolve(dependencies.venues)
      await waitForState(
        session,
        (state) => state.resourceStatus.venue.status === 'loaded',
      )
      transit.resolve(dependencies.transit)

      await expect(start).rejects.toThrow('transit endpoint synchronization failed')
      expect(session.getState().status).toBe(
        '1 venues available; loading shuttle routes…',
      )
      expect(map.setTripRequest).toHaveBeenCalledTimes(2)
      session.dispose()
    }

    {
      const { venue, transit, session, start } = createPendingSession()
      session.subscribe(() => {
        throw new Error('venue subscriber failed')
      })
      venue.resolve({
        venues: {
          COM1: {
            roomName: 'Computing 1',
            location: { x: 103, y: 1 },
          },
        },
        venueCount: 1,
      })

      await expect(start).rejects.toThrow('venue subscriber failed')
      expect(session.getState().status).toBe(
        '1 venues available; loading shuttle routes…',
      )
      session.dispose()
      transit.resolve(createDependencies().transit)
    }

    {
      const { venue, transit, dependencies, session, start } = createPendingSession()
      venue.resolve(dependencies.venues)
      await waitForState(
        session,
        (state) => state.resourceStatus.venue.status === 'loaded',
      )
      session.subscribe(() => {
        throw new Error('transit subscriber failed')
      })
      transit.resolve(dependencies.transit)

      await expect(start).rejects.toThrow('transit subscriber failed')
      expect(session.getState().status).toBe(
        '1 venues · 2 shuttle stops · 1 shuttle routes loaded',
      )
      session.dispose()
    }
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

  it('propagates map readiness failures without marking transit data failed', async () => {
    const mapReady = Promise.reject(new Error('map startup failed'))
    const dependencies = createDependencies({ map: createMapDouble(mapReady) })
    const session = createNavigationSession(dependencies)

    await expect(session.start(new AbortController().signal)).rejects.toThrow('map startup failed')
    expect(session.getState().resourceStatus.transit).toEqual({ status: 'pending' })
    expect(session.getState().status).not.toContain('Unable to load shuttle route data')
  })

  it('keeps map-readiness failures distinct across venue completion orderings', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const scenarios = [
        {
          venueFailed: false,
          readinessFirst: false,
          expectedStatus: '1 venues available; loading shuttle routes…',
        },
        {
          venueFailed: false,
          readinessFirst: true,
          expectedStatus: '1 venues available; loading shuttle routes…',
        },
        {
          venueFailed: true,
          readinessFirst: false,
          expectedStatus: 'Unable to load venue data',
        },
        {
          venueFailed: true,
          readinessFirst: true,
          expectedStatus: 'Unable to load venue data',
        },
      ] as const

      for (const scenario of scenarios) {
        const mapReady = createDeferred<void>()
        const venue = createDeferred<LoadedVenueData>()
        const transit = createDeferred<LoadedTransitData>()
        const dependencies = createDependencies({
          map: createMapDouble(mapReady.promise),
          loadVenues: vi.fn(() => venue.promise),
          loadTransit: vi.fn(() => transit.promise),
        })
        const session = createNavigationSession(dependencies)
        const start = session.start(new AbortController().signal)
        transit.resolve(dependencies.transit)
        await Promise.resolve()
        await Promise.resolve()

        const completeVenue = async (): Promise<void> => {
          const completed = waitForState(
            session,
            (state) => state.resourceStatus.venue.status !== 'pending',
          )
          if (scenario.venueFailed) venue.reject(new Error('venues unavailable'))
          else venue.resolve(dependencies.venues)
          await completed
        }

        if (scenario.readinessFirst) {
          mapReady.reject(new Error('map startup failed'))
          await expect(start).rejects.toThrow('map startup failed')
          await completeVenue()
        } else {
          await completeVenue()
          mapReady.reject(new Error('map startup failed'))
          await expect(start).rejects.toThrow('map startup failed')
        }

        expect(session.getState().resourceStatus.transit).toEqual({ status: 'pending' })
        expect(session.getState().status).toBe(scenario.expectedStatus)
        session.dispose()
      }
    } finally {
      consoleError.mockRestore()
    }
  })

  it('does not label map synchronization failures as data load failures', async () => {
    const dependencies = createDependencies()
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    map.setTripRequest.mockImplementation(() => {
      throw new Error('map endpoint synchronization failed')
    })

    expect(() => session.setTripEndpoint('origin', { kind: 'venue', id: 'COM1' }))
      .toThrow('map endpoint synchronization failed')
    expect(session.getState().resourceStatus).toMatchObject({
      venue: { status: 'loaded' },
      transit: { status: 'loaded' },
    })
    expect(session.getState().status).not.toContain('Unable to load venue data')
    expect(session.getState().status).not.toContain('Unable to load shuttle route data')
  })

  it('does not label subscriber failures as data load failures', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    session.subscribe(() => {
      throw new Error('subscriber failed')
    })

    expect(() => session.setContextualPanelQuery('COM1')).toThrow('subscriber failed')
    expect(session.getState().resourceStatus).toMatchObject({
      venue: { status: 'loaded' },
      transit: { status: 'loaded' },
    })
    expect(session.getState().status).not.toContain('Unable to load venue data')
    expect(session.getState().status).not.toContain('Unable to load shuttle route data')
  })

  it('stores startup failure without re-running map effects or propagating listener errors', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    await session.start(new AbortController().signal)
    const map = dependencies.map as ReturnType<typeof createMapDouble>
    const mapCallCount = map.setTripRequest.mock.calls.length
    const listenerError = new Error('startup listener failed')
    const listener = vi.fn(() => {
      throw listenerError
    })
    const cleanup = session.subscribe(listener)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      expect(() => session.reportStartupFailure()).not.toThrow()
      expect(session.getState().status).toBe('Unable to start map navigation')
      expect(session.getState().startupFailure).toEqual({ message: 'Unable to start map navigation' })
      expect(map.setTripRequest).toHaveBeenCalledTimes(mapCallCount)
      expect(listener).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(
        'Navigation session startup failure listener failed:',
        listenerError,
      )

      cleanup()
      session.reportMapError(new Error('late map error'))
      expect(session.getState().status).toBe('Unable to start map navigation')
    } finally {
      consoleError.mockRestore()
      session.dispose()
    }
  })

  it('settles startup on external abort while map readiness is pending', async () => {
    const mapReady = createDeferred<void>()
    const dependencies = createDependencies({ map: createMapDouble(mapReady.promise) })
    const session = createNavigationSession(dependencies)
    const listener = vi.fn()
    session.subscribe(listener)
    const external = new AbortController()
    const start = session.start(external.signal)

    await waitForState(
      session,
      (state) => state.resourceStatus.venue.status === 'loaded',
    )
    external.abort()
    await expect(start).resolves.toBeUndefined()

    expect(session.getState().resourceStatus.transit).toEqual({ status: 'pending' })
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledOnce()

    mapReady.resolve()
    await Promise.resolve()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
  })

  it('settles startup on disposal while map readiness is pending', async () => {
    const mapReady = createDeferred<void>()
    const dependencies = createDependencies({ map: createMapDouble(mapReady.promise) })
    const session = createNavigationSession(dependencies)
    const start = session.start(new AbortController().signal)

    await waitForState(
      session,
      (state) => state.resourceStatus.venue.status === 'loaded',
    )
    session.dispose()
    await expect(start).resolves.toBeUndefined()

    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
    expect(dependencies.map.dispose).toHaveBeenCalledOnce()

    mapReady.resolve()
    await Promise.resolve()
    expect(dependencies.map.loadTransitData).not.toHaveBeenCalled()
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

    await Promise.resolve()

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

  it('does not invoke deferred loaders after immediate disposal', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    const start = session.start(new AbortController().signal)
    session.dispose()

    await expect(start).resolves.toBeUndefined()
    expect(dependencies.loadVenues).not.toHaveBeenCalled()
    expect(dependencies.loadTransit).not.toHaveBeenCalled()
  })

  it('does not invoke deferred loaders after immediate external abort', async () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const externalController = new AbortController()

    const start = session.start(externalController.signal)
    externalController.abort()

    await expect(start).resolves.toBeUndefined()
    expect(dependencies.loadVenues).not.toHaveBeenCalled()
    expect(dependencies.loadTransit).not.toHaveBeenCalled()
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

  it('keeps mixed venue and transit outcomes deterministic for either completion order', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const scenarios = [
        {
          venueFailed: false,
          transitFailed: true,
          expectedStatus: '1 venues available; Unable to load shuttle route data',
        },
        {
          venueFailed: true,
          transitFailed: false,
          expectedStatus: '2 shuttle stops · 1 shuttle routes loaded; Unable to load venue data',
        },
      ] as const
      const completionOrders = [
        ['venue', 'transit'],
        ['transit', 'venue'],
      ] as const

      for (const scenario of scenarios) {
        for (const completionOrder of completionOrders) {
          const venue = createDeferred<LoadedVenueData>()
          const transit = createDeferred<LoadedTransitData>()
          const dependencies = createDependencies({
            loadVenues: vi.fn(() => venue.promise),
            loadTransit: vi.fn(() => transit.promise),
          })
          const session = createNavigationSession(dependencies)
          const start = session.start(new AbortController().signal)

          for (const resource of completionOrder) {
            const completed = waitForState(
              session,
              (state) => state.resourceStatus[resource].status !== 'pending',
            )
            if (resource === 'venue') {
              if (scenario.venueFailed) venue.reject(new Error('venues unavailable'))
              else venue.resolve(dependencies.venues)
            } else if (scenario.transitFailed) {
              transit.reject(new Error('transit unavailable'))
            } else {
              transit.resolve(dependencies.transit)
            }
            await completed
          }

          await start
          expect(session.getState().status).toBe(scenario.expectedStatus)
          session.dispose()
        }
      }
    } finally {
      consoleError.mockRestore()
    }
  })

  it('publishes location updates without moving the map or changing trip endpoints', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)
    const initialTripRequest = session.getState().tripRequest
    const locationState: LocationTrackingState = {
      status: 'tracking',
      latestFix: {
        longitude: 103.7844,
        latitude: 1.2933,
        accuracy: 12,
        timestamp: 1_000,
      },
    }

    session.enableLocationTracking()
    const locationTracker = dependencies.locationTracker as ReturnType<typeof createLocationTrackerDouble>
    locationTracker.emit(locationState)

    expect(dependencies.locationTracker.enable).toHaveBeenCalledOnce()
    expect(session.getState().location).toEqual(locationState)
    expect(session.getState().tripRequest).toBe(initialTripRequest)
    expect(dependencies.map.resetView).not.toHaveBeenCalled()
    expect(dependencies.map.setViewportInsets).not.toHaveBeenCalled()
    expect(dependencies.map.setTripRequest).not.toHaveBeenCalled()
  })

  it('disables and disposes the location tracker through session commands', () => {
    const dependencies = createDependencies()
    const session = createNavigationSession(dependencies)

    session.disableLocationTracking()
    session.dispose()

    expect(dependencies.locationTracker.disable).toHaveBeenCalledOnce()
    expect(dependencies.locationTracker.dispose).toHaveBeenCalledOnce()
  })
})

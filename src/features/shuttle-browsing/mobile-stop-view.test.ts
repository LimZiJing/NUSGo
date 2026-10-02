import { describe, expect, it } from 'vitest'
import {
  createInitialMobileStopViewState,
  getMobileStopSheetSelection,
  mobileStopViewReducer,
} from './mobile-stop-view'
import { createTransitIndex } from '../../domain/transit'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import type { ShuttleServiceWindow } from '../../domain/transit/service-hours'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'

describe('mobile stop view state', () => {
  it('keeps a focused stop until Back to stops is explicitly selected', () => {
    const focused = mobileStopViewReducer(createInitialMobileStopViewState(), {
      type: 'focus-stop',
      stopId: 'SR7',
    })

    expect(focused.focusedStopId).toBe('SR7')
    expect(mobileStopViewReducer(focused, { type: 'back-to-stops' }).focusedStopId).toBeNull()
  })

  it('maps a fresh arrival snapshot to canonical route departures and adjusts for snapshot age', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 30,
            upcomingArrivalSeconds: [30, 330, 930],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:20.000Z'),
    )

    expect(selection.departures.map(({ routeId }) => routeId)).toEqual(['A1'])
    expect(selection.departures[0]?.timings).toEqual(['Arr', '6m', '16m'])
    expect(selection.live).toBe(true)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('uses each stop observation clock for its displayed arrivals', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stopObservations: {
        'STOP-A': {
          observedAt: '2026-09-30T00:00:00.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
        },
        'STOP-B': {
          observedAt: '2026-09-30T00:00:10.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
        },
      },
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 71,
            upcomingArrivalSeconds: [71, 131],
            headwaySeconds: { min: 60, median: 60, max: 60 },
          },
        },
        'STOP-B': {
          A1: {
            nextArrivalSeconds: 71,
            upcomingArrivalSeconds: [71, 131],
            headwaySeconds: { min: 60, median: 60, max: 60 },
          },
        },
      },
    }

    const nowMs = Date.parse('2026-09-30T00:00:20.000Z')
    const stopA = getMobileStopSheetSelection(index.stopById.get('STOP-A')!, index, [], snapshot, nowMs)
    const stopB = getMobileStopSheetSelection(index.stopById.get('STOP-B')!, index, [], snapshot, nowMs)

    expect(stopA.departures[0]?.timings).toEqual(['Arr', '2m', '-'])
    expect(stopB.departures[0]?.timings).toEqual(['2m', '3m', '-'])
  })

  it('keeps slightly stale arrivals during the refresh grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:31.000Z'),
    )

    expect(selection.departures[0]?.timings).toEqual(['5m', '10m', '-'])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('removes arrivals after the maximum stale boundary', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:02:01.000Z'),
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBe('No live data')
  })

  it('shows a scheduled first-bus estimate within the 30-minute grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const emptySnapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: { 'STOP-A': {} },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '00:06', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      emptySnapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.scheduledDepartures).toEqual([{
      routeId: 'A1',
      routeName: 'A1',
      routeColor: '#123456',
      message: 'First bus in 6m',
    }])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('does not treat a long pre-service arrival as live timing', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 19_680,
            upcomingArrivalSeconds: [19_680, 20_100, 20_520],
            headwaySeconds: { min: 420, median: 420, max: 420 },
          },
        },
      },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '06:00', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.scheduledDepartures.map(({ routeId, message }) => ({ routeId, message }))).toEqual([
      { routeId: 'A1', message: 'Starts 6:00 AM' },
    ])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('keeps old rows during a refresh without marking them live or stale', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: null,
          },
        },
      },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '00:00', lastTime: '23:59', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:31.000Z'),
      serviceWindows,
      true,
    )

    expect(selection.departures[0]?.timings).toEqual(['5m', '10m', '-'])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('uses compact service text when the next start is outside the grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const emptySnapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: { 'STOP-A': {} },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '01:00', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      [],
      emptySnapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.scheduledDepartures.map(({ routeId, message }) => ({ routeId, message }))).toEqual([
      { routeId: 'A1', message: 'Starts 1:00 AM' },
    ])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('adds downstream favourite stop nicknames to matching route departures', () => {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-A']
    network.stops.push({
      id: 'STOP-C',
      longName: 'Stop C',
      shortName: 'C',
      latitude: 1.2,
      longitude: 103.2,
      services: ['A1'],
      opposite: null,
    })
    const index = createTransitIndex(network)

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      ['STOP-C'],
      {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 300,
              upcomingArrivalSeconds: [300],
              headwaySeconds: null,
            },
          },
        },
      },
      Date.parse('2026-09-30T00:00:00.000Z'),
    )

    expect(selection.departures[0]?.reachableFavoriteStops).toEqual([
      { id: 'STOP-C', name: 'C', isOpposite: false },
    ])
  })

  it('marks a reachable favourite as opposite when the route reaches the selected stop opposite', () => {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-A']
    network.stops.push({
      id: 'STOP-C',
      longName: 'Stop C',
      shortName: 'C',
      latitude: 1.2,
      longitude: 103.2,
      services: ['A1'],
      opposite: null,
    })
    const index = createTransitIndex(network)

    const selection = getMobileStopSheetSelection(
      index.stopById.get('STOP-A')!,
      index,
      ['STOP-B', 'STOP-C'],
      {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 300,
              upcomingArrivalSeconds: [300],
              headwaySeconds: null,
            },
          },
        },
      },
      Date.parse('2026-09-30T00:00:00.000Z'),
    )

    expect(selection.departures[0]?.reachableFavoriteStops).toEqual([
      { id: 'STOP-B', name: 'B', isOpposite: true },
      { id: 'STOP-C', name: 'C', isOpposite: false },
    ])
  })

  it('keeps list, expansion, and favourites state until canonical stops are reconciled', () => {
    const initial = createInitialMobileStopViewState(['STOP-A', 'missing'])
    const favourites = mobileStopViewReducer(initial, { type: 'select-list', list: 'favourites' })
    const expanded = mobileStopViewReducer(favourites, { type: 'toggle-expanded', stopId: 'STOP-A' })
    const focused = mobileStopViewReducer(expanded, { type: 'focus-stop', stopId: 'STOP-A' })

    expect(focused.list).toBe('favourites')
    expect(focused.expandedStopIds).toEqual({ nearby: [], favourites: ['STOP-A'] })
    expect(focused.favoriteStopIds).toEqual(['STOP-A', 'missing'])

    const reconciled = mobileStopViewReducer(focused, {
      type: 'reconcile-stops',
      stopIds: new Set(['STOP-A']),
    })
    expect(reconciled.favoriteStopIds).toEqual(['STOP-A'])
    expect(reconciled.expandedStopIds).toEqual({ nearby: [], favourites: ['STOP-A'] })
    expect(reconciled.focusedStopId).toBe('STOP-A')
    expect(mobileStopViewReducer(reconciled, { type: 'toggle-expanded', stopId: 'STOP-A' })
      .expandedStopIds).toEqual({ nearby: [], favourites: [] })
  })

  it('starts timings closed and expands Nearby without expanding Favourites', () => {
    const initial = createInitialMobileStopViewState()

    expect(initial.expandedStopIds).toEqual({ nearby: [], favourites: [] })

    const nearbyExpanded = mobileStopViewReducer(initial, {
      type: 'expand-nearby',
      stopIds: ['STOP-A', 'STOP-B'],
    })

    expect(nearbyExpanded.expandedStopIds).toEqual({
      nearby: ['STOP-A', 'STOP-B'],
      favourites: [],
    })

    const favouritesExpanded = mobileStopViewReducer(
      mobileStopViewReducer(nearbyExpanded, { type: 'select-list', list: 'favourites' }),
      { type: 'toggle-expanded', stopId: 'STOP-A' },
    )

    expect(favouritesExpanded.expandedStopIds).toEqual({
      nearby: ['STOP-A', 'STOP-B'],
      favourites: ['STOP-A'],
    })
  })

  it('keeps manually expanded stops when Nearby is refreshed', () => {
    const manuallyExpanded = mobileStopViewReducer(
      createInitialMobileStopViewState(),
      { type: 'toggle-expanded', stopId: 'STOP-C' },
    )

    const refreshed = mobileStopViewReducer(manuallyExpanded, {
      type: 'expand-nearby',
      stopIds: ['STOP-A'],
    })

    expect(refreshed.expandedStopIds.nearby).toEqual(['STOP-C', 'STOP-A'])
  })
})

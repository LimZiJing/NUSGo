import { describe, expect, it } from 'vitest'
import {
  createInitialMobileStopViewState,
  getMobileStopSheetSelection,
  mobileStopViewReducer,
} from './mobile-stop-view'
import { createTransitIndex } from '../../domain/transit'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
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

  it('does not present stale arrivals as live or replace them with placeholder timings', () => {
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

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBe('Live shuttle arrivals are stale.')
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
    const collapsed = mobileStopViewReducer(favourites, { type: 'toggle-expanded', stopId: 'STOP-A' })
    const focused = mobileStopViewReducer(collapsed, { type: 'focus-stop', stopId: 'STOP-A' })

    expect(focused.list).toBe('favourites')
    expect(focused.collapsedStopIds).toEqual(['STOP-A'])
    expect(focused.favoriteStopIds).toEqual(['STOP-A', 'missing'])

    const reconciled = mobileStopViewReducer(focused, {
      type: 'reconcile-stops',
      stopIds: new Set(['STOP-A']),
    })
    expect(reconciled.favoriteStopIds).toEqual(['STOP-A'])
    expect(reconciled.collapsedStopIds).toEqual(['STOP-A'])
    expect(reconciled.focusedStopId).toBe('STOP-A')
    expect(mobileStopViewReducer(reconciled, { type: 'toggle-expanded', stopId: 'STOP-A' })
      .collapsedStopIds).toEqual([])
  })
})

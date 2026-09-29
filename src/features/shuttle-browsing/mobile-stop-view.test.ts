import { describe, expect, it } from 'vitest'
import {
  createInitialMobileStopViewState,
  getMobileStopSheetSelection,
  getMobileStopDepartures,
  mobileStopViewReducer,
} from './mobile-stop-view'
import { createTransitIndex } from '../../domain/transit'
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

  it('filters fixed timings to the routes that serve the focused stop', () => {
    const departures = getMobileStopDepartures(new Set(['D2', 'A1']))

    expect(departures.map(({ routeId }) => routeId)).toEqual(['A1', 'D2'])
    expect(departures[0]?.timings).toEqual(['Arr', '8m', '17m'])
    expect(departures[1]?.timings).toEqual(['4m', '12m', '-'])
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

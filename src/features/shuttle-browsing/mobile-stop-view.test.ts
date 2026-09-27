import { describe, expect, it } from 'vitest'
import {
  createInitialMobileStopViewState,
  getMobileStopDepartures,
  mobileStopViewReducer,
} from './mobile-stop-view'

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

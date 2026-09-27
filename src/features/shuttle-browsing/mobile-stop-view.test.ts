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
})

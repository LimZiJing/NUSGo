import { describe, expect, it } from 'vitest'
import { parseRouteServiceWindows } from './response'

describe('parseRouteServiceWindows', () => {
  it('parses the NUS route-min-max-time response', () => {
    expect(parseRouteServiceWindows({
      data: {
        RouteMinMaxTime: [
          { Route: 'D2', FirstTime: '07:15', LastTime: '23:00', DayType: 'Mon-Fri', Dates: null },
          { Route: 'D2', FirstTime: '09:00', LastTime: '23:00', DayType: 'Special Day', Dates: '2026-09-23, 2026-09-24' },
        ],
      },
    }, 'D2')).toEqual([
      { routeId: 'D2', firstTime: '07:15', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] },
      { routeId: 'D2', firstTime: '09:00', lastTime: '23:00', dayType: 'Special Day', dates: ['2026-09-23', '2026-09-24'] },
    ])
  })

  it('ignores malformed rows', () => {
    expect(parseRouteServiceWindows({ data: { RouteMinMaxTime: [{ Route: 'D2' }] } }, 'D2')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { parseShuttleServiceResponse } from './response'

describe('parseShuttleServiceResponse', () => {
  it('normalizes route arrivals and calculates a headway range', () => {
    const [route] = parseShuttleServiceResponse({
      data: [{
        route_code: 'D2',
        next_arrival_minutes: 4,
        next_arrival_seconds: 264,
        upcoming_arrival_seconds: [264, 624, 982, 1459, 1939],
      }],
    })

    expect(route).toEqual({
      routeId: 'D2',
      arrival: {
        nextArrivalSeconds: 264,
        upcomingArrivalSeconds: [264, 624, 982, 1459, 1939],
        headwaySeconds: { min: 358, max: 480, median: 418.5 },
      },
    })
  })

  it('parses the NUS shuttle-service response shape', () => {
    const [route] = parseShuttleServiceResponse({
      data: {
        name: 'PGP',
        shuttles: [{
          name: 'D2',
          routeid: 90295,
          _etas: [
            { eta: 2, eta_s: 140 },
            { eta: 10, eta_s: 588 },
            { eta: 18, eta_s: 1068 },
            { eta: 26, eta_s: 1547 },
            { eta: 34, eta_s: 2026 },
          ],
        }],
      },
    })

    expect(route).toMatchObject({
      routeId: 'D2',
      arrival: {
        nextArrivalSeconds: 140,
        upcomingArrivalSeconds: [140, 588, 1068, 1547, 2026],
      },
    })
  })

  it('ignores invalid and negative arrival values', () => {
    expect(parseShuttleServiceResponse({
      data: [
        { route: 'D2', next_arrival_seconds: -1 },
        { route: 'D1', next_arrival_seconds: 'not available' },
      ],
    })).toEqual([])

    expect(parseShuttleServiceResponse({
      data: [{
        route: 'D2',
        next_arrival_seconds: -1,
        upcoming_arrival_seconds: [300, -20],
      }],
    })[0]?.arrival.nextArrivalSeconds).toBe(300)
  })
})

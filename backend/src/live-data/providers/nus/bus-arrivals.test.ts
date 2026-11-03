import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseNusBusArrivalResponse } from './bus-arrivals.ts'

describe('NUS bus-arrival response parsing', () => {
  it('normalizes arrival values and rejects malformed response envelopes', () => {
    const [route] = parseNusBusArrivalResponse({
      data: [{
        route_code: 'D2',
        next_arrival_minutes: 4,
        next_arrival_seconds: 264,
        upcoming_arrival_seconds: [264, 624, 982],
        _etas: [
          { eta_s: 264, plate: 'PD-FIRST' },
          { eta_s: 624, plate: 'PD-SECOND' },
          { eta_s: 982, plate: 'PD-THIRD' },
        ],
      }],
    })

    assert.deepEqual(route, {
      routeId: 'D2',
      arrival: {
        nextArrivalSeconds: 264,
        upcomingArrivalSeconds: [264, 624, 982],
        headwaySeconds: { min: 358, max: 360, median: 359 },
        nextBusPlate: 'PD-FIRST',
        upcomingBusPlates: ['PD-FIRST', 'PD-SECOND', 'PD-THIRD'],
      },
    })
    assert.throws(() => parseNusBusArrivalResponse({ error: 'unavailable' }), /response was invalid/)
    assert.throws(() => parseNusBusArrivalResponse({ data: [{ unexpected: true }] }), /response was invalid/)
    assert.deepEqual(parseNusBusArrivalResponse({ data: [] }), [])
  })
})

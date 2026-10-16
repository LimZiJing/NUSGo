import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseLtaPublicBusStopMapping } from './lta/mapping.ts'
import { parseRequestedLtaStops } from './lta/request.ts'
import { parseLtaBusArrivalResponse } from './lta/response.ts'
import { parseRouteServiceWindows } from './service-window-response.ts'
import { parseShuttleServiceResponse } from './shuttle-response.ts'

const ltaMappings = [
  { stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151'] },
  { stopId: 'STOP-B', busStopCode: '54321', services: ['96'] },
] as const

describe('backend provider boundaries', () => {
  it('normalizes NUS arrival values and rejects malformed response envelopes', () => {
    const [route] = parseShuttleServiceResponse({
      data: [{
        route_code: 'D2',
        next_arrival_minutes: 4,
        next_arrival_seconds: 264,
        upcoming_arrival_seconds: [264, 624, 982],
      }],
    })

    assert.deepEqual(route, {
      routeId: 'D2',
      arrival: {
        nextArrivalSeconds: 264,
        upcomingArrivalSeconds: [264, 624, 982],
        headwaySeconds: { min: 358, max: 360, median: 359 },
      },
    })
    assert.throws(() => parseShuttleServiceResponse({ error: 'unavailable' }), /response was invalid/)
    assert.throws(() => parseShuttleServiceResponse({ data: [{ unexpected: true }] }), /response was invalid/)
    assert.deepEqual(parseShuttleServiceResponse({ data: [] }), [])
  })

  it('validates and normalizes NUS service-window payloads', () => {
    assert.deepEqual(parseRouteServiceWindows({
      data: {
        RouteMinMaxTime: [
          { FirstTime: '06:00', LastTime: '23:00', DayType: 'Daily', Dates: '2026-10-15, invalid' },
          { FirstTime: '', LastTime: '23:00', DayType: 'Daily' },
        ],
      },
    }, 'D1'), [{
      routeId: 'D1',
      firstTime: '06:00',
      lastTime: '23:00',
      dayType: 'Daily',
      dates: ['2026-10-15'],
    }])
    assert.throws(() => parseRouteServiceWindows({ data: {} }, 'D1'), /response was invalid/)
  })

  it('validates LTA stop mappings, requested stops, and provider arrival fields', () => {
    assert.deepEqual(parseLtaPublicBusStopMapping({
      stops: [{ stopId: 'STOP-A', busStopCode: '12345', services: ['151', '95', '95'] }],
    }), [{ stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151'] }])
    assert.throws(() => parseLtaPublicBusStopMapping({
      stops: [
        { stopId: 'STOP-A', busStopCode: '12345', services: ['95'] },
        { stopId: 'STOP-A', busStopCode: '54321', services: ['96'] },
      ],
    }), /Duplicate/)
    assert.deepEqual(parseRequestedLtaStops(['STOP-A'], ltaMappings), [ltaMappings[0]])
    assert.deepEqual(parseRequestedLtaStops(['STOP-A', 'STOP-A'], ltaMappings), [ltaMappings[0]])
    assert.throws(() => parseRequestedLtaStops(['UNMAPPED'], ltaMappings), /Unknown mapped/)
    assert.throws(() => parseLtaBusArrivalResponse({
      Services: [{ ServiceNo: '95', NextBus: { EstimatedArrival: 'not a date', Monitored: 1 } }],
    }, ['95']), /invalid estimated arrival/)
    assert.throws(() => parseLtaBusArrivalResponse({
      Services: [{ ServiceNo: '95', NextBus: { EstimatedArrival: '2026-10-15T03:05:00.000Z', Monitored: 2 } }],
    }, ['95']), /invalid monitored flag/)
  })
})

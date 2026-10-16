import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseLtaPublicBusStopMapping } from './lta/mapping.ts'
import { parseRequestedLtaStops } from './lta/request.ts'
import { parseLtaBusArrivalResponse } from './lta/response.ts'

const ltaMappings = [
  { stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151'] },
  { stopId: 'STOP-B', busStopCode: '54321', services: ['96'] },
] as const

describe('backend provider boundaries', () => {
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

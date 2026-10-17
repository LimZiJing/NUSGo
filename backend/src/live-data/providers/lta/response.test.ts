import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseLtaBusArrivalResponse } from './response.ts'

describe('LTA bus-arrival response parsing', () => {
  it('rejects invalid estimated-arrival timestamps and monitored flags', () => {
    assert.throws(() => parseLtaBusArrivalResponse({
      Services: [{ ServiceNo: '95', NextBus: { EstimatedArrival: 'not a date', Monitored: 1 } }],
    }, ['95']), /invalid estimated arrival/)
    assert.throws(() => parseLtaBusArrivalResponse({
      Services: [{ ServiceNo: '95', NextBus: { EstimatedArrival: '2026-10-15T03:05:00.000Z', Monitored: 2 } }],
    }, ['95']), /invalid monitored flag/)
  })
})

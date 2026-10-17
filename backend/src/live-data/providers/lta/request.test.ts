import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRequestedLtaStops } from './request.ts'
import type { LtaPublicBusStopMapping } from './bus-stop-mapping.ts'

const mappings: readonly LtaPublicBusStopMapping[] = [
  { stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151'] },
  { stopId: 'STOP-B', busStopCode: '54321', services: ['96'] },
]

describe('LTA bus-stop request selection', () => {
  it('selects mapped stops in request order and removes duplicates', () => {
    assert.deepEqual(parseRequestedLtaStops(['STOP-A'], mappings), [mappings[0]])
    assert.deepEqual(parseRequestedLtaStops(['STOP-A', 'STOP-A'], mappings), [mappings[0]])
  })

  it('rejects stop IDs without an LTA mapping', () => {
    assert.throws(() => parseRequestedLtaStops(['UNMAPPED'], mappings), /Unknown mapped/)
  })
})

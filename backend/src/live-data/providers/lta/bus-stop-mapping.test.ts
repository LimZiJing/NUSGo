import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseLtaPublicBusStopMapping,
  validateLtaPublicBusStopMappings,
} from './bus-stop-mapping.ts'

describe('LTA bus-stop mappings', () => {
  it('validates mapping records, canonical stop IDs, and service tokens', () => {
    const mappings = parseLtaPublicBusStopMapping({
      stops: [{ stopId: 'STOP-A', busStopCode: '12345', services: ['151', '95', '95'] }],
    })
    assert.deepEqual(mappings, [{ stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151'] }])
    assert.deepEqual(validateLtaPublicBusStopMappings(mappings, new Set(['STOP-A'])), mappings)
    assert.throws(() => validateLtaPublicBusStopMappings(mappings, new Set(['STOP-B'])), /canonical bus stops/)
  })

  it('rejects duplicate canonical stop mappings', () => {
    assert.throws(() => parseLtaPublicBusStopMapping({
      stops: [
        { stopId: 'STOP-A', busStopCode: '12345', services: ['95'] },
        { stopId: 'STOP-A', busStopCode: '54321', services: ['96'] },
      ],
    }), /Duplicate/)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InvalidSelectionError, parseBusStopSelection } from './stop-selection.ts'

const canonicalStopIds = ['STOP-A', 'STOP-B'] as const
const canonicalOptions = {
  queryLabel: 'stops',
  itemLabel: 'requested stop',
  unknownStop: (stopId: string) => 'Unknown canonical bus stop: ' + stopId,
}

describe('HTTP bus-stop selection validation', () => {
  it('accepts canonical stop IDs and ignores untrusted names from the request', () => {
    assert.deepEqual(parseBusStopSelection(JSON.stringify([
      'STOP-A',
      { stopId: 'STOP-B', stopName: 'Untrusted browser name' },
    ]), canonicalStopIds, canonicalOptions), ['STOP-A', 'STOP-B'])
    assert.deepEqual(parseBusStopSelection(JSON.stringify(['STOP-A', 'STOP-A']), canonicalStopIds, canonicalOptions), ['STOP-A'])
  })

  it('rejects malformed queries and unknown canonical stops', () => {
    assert.throws(() => parseBusStopSelection('{', canonicalStopIds, canonicalOptions), /valid JSON/)
    assert.throws(() => parseBusStopSelection(JSON.stringify(['UNKNOWN']), canonicalStopIds, canonicalOptions), /Unknown canonical bus stop/)
    assert.throws(() => parseBusStopSelection(null, canonicalStopIds, canonicalOptions), InvalidSelectionError)
  })
})

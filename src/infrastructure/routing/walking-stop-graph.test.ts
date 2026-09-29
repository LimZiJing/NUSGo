import { describe, expect, it } from 'vitest'
import { validateWalkingStopGraph } from './walking-stop-graph'

const validGraph = {
  version: 1,
  networkVersion: 1,
  routingProfile: 'pedestrian',
  routingDataVersion: 'test',
  stopIds: ['STOP-A', 'STOP-B'],
  connections: [
    {
      fromStopId: 'STOP-A',
      toStopId: 'STOP-B',
      distanceMeters: 120,
      durationSeconds: 90,
    },
  ],
}

describe('walking stop graph validation', () => {
  it('converts validated stop IDs into provider keys', () => {
    expect(validateWalkingStopGraph(validGraph)).toMatchObject({
      version: 1,
      stopIds: ['STOP-A', 'STOP-B'],
      connections: [{
        fromKey: 'stop:STOP-A',
        toKey: 'stop:STOP-B',
        distanceMeters: 120,
        durationSeconds: 90,
      }],
    })
  })

  it('rejects a graph connection that references an unknown stop', () => {
    expect(() => validateWalkingStopGraph({
      ...validGraph,
      connections: [{ ...validGraph.connections[0], toStopId: 'STOP-C' }],
    })).toThrow('references an unknown stop')
  })
})

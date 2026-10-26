import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '@nusgo/shared/transit/index'
import { validateTransitNetwork } from '@nusgo/shared/transit/model'
import { selectWalkingConnections } from './select-walking-connections.ts'
import type { ResolvedPathEndpoints } from './resolve-path-endpoints.ts'

describe('selectWalkingConnections', () => {
  it('does not reuse an excluded destination connector as a transfer', async () => {
    const network = validateTransitNetwork({
      version: 1,
      metadata: {
        source: 'test',
        routeStopOrder: 'test',
        routeGeometry: 'test',
        verifiedAt: '2026-09-22',
        routeOrderSource: 'test',
        coordinateSource: 'test',
      },
      routes: [
        { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-C'] },
        { id: 'B1', name: 'B1', color: '#234567', stopIds: ['STOP-D', 'STOP-B'] },
      ],
      stops: [
        { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
        { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['B1'], opposite: 'STOP-D' },
        { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.002, services: ['A1'] },
        { id: 'STOP-D', longName: 'Stop D', shortName: 'D', latitude: 1, longitude: 103.003, services: ['B1'], opposite: 'STOP-B' },
      ],
    })
    const destination = { key: 'stop:STOP-D', endpoint: { kind: 'stop', id: 'STOP-D' } as const, coordinate: { longitude: 103.003, latitude: 1 } }
    const endpoints: ResolvedPathEndpoints = {
      origin: { key: 'venue:ORIGIN', endpoint: { kind: 'venue', id: 'ORIGIN' }, coordinate: { longitude: 102.999, latitude: 1 } },
      destination,
      all: [
        { key: 'venue:ORIGIN', endpoint: { kind: 'venue', id: 'ORIGIN' }, coordinate: { longitude: 102.999, latitude: 1 } },
        destination,
        { key: 'stop:STOP-A', endpoint: { kind: 'stop', id: 'STOP-A' }, coordinate: { longitude: 103, latitude: 1 } },
        { key: 'stop:STOP-B', endpoint: { kind: 'stop', id: 'STOP-B' }, coordinate: { longitude: 103.001, latitude: 1 } },
        { key: 'stop:STOP-C', endpoint: { kind: 'stop', id: 'STOP-C' }, coordinate: { longitude: 103.002, latitude: 1 } },
      ],
    }
    const connections = [
      { fromKey: 'stop:STOP-C', toKey: destination.key, distanceMeters: 10, durationSeconds: 10 },
      { fromKey: 'stop:STOP-B', toKey: destination.key, distanceMeters: 20, durationSeconds: 20 },
    ]
    const provider = { getWalkingConnections: async () => connections }

    const selected = await selectWalkingConnections(
      endpoints,
      createTransitIndex(network),
      provider,
      new AbortController().signal,
    )

    expect(selected.map(({ from, to }) => [from, to])).toEqual([
      [{ kind: 'stop', id: 'STOP-B' }, { kind: 'stop', id: 'STOP-D' }],
    ])
  })
})

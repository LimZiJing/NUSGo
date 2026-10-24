import { describe, expect, it, vi } from 'vitest'
import type { WalkingConnectionRequest, WalkingRouteEngine } from './walking-contracts.ts'
import { createWalkingConnectionProvider } from './walking-connections.ts'
import type { WalkingStopGraph } from '@navus/shared/routing/walking-stop-graph'

const origin = {
  key: 'venue:origin',
  coordinate: { longitude: 103, latitude: 1 },
}
const destination = {
  key: 'venue:destination',
  coordinate: { longitude: 103.01, latitude: 1.01 },
}
const stopA = {
  key: 'stop:STOP-A',
  stopId: 'STOP-A',
  coordinate: { longitude: 103.001, latitude: 1 },
}
const stopB = {
  key: 'stop:STOP-B',
  stopId: 'STOP-B',
  coordinate: { longitude: 103.002, latitude: 1 },
}
const stopC = {
  key: 'stop:STOP-C',
  stopId: 'STOP-C',
  coordinate: { longitude: 103.003, latitude: 1 },
}

const request: WalkingConnectionRequest = {
  origin,
  destination,
  stops: [stopA, stopB],
}

const graph: WalkingStopGraph = {
  version: 1,
  networkVersion: 1,
  routingProfile: 'pedestrian',
  routingDataVersion: 'test',
  stopIds: ['STOP-A', 'STOP-B'],
  connections: [
    { fromKey: 'stop:STOP-A', toKey: 'stop:STOP-B', distanceMeters: 120, durationSeconds: 90 },
    { fromKey: 'stop:STOP-B', toKey: 'stop:STOP-A', distanceMeters: 140, durationSeconds: 110 },
  ],
}

function createRouteEngine(): WalkingRouteEngine {
  return {
    routeWalking: vi.fn(),
    matrixWalking: vi.fn(async ({ sources }) => {
      if (sources.length === 1) {
        return [
          { fromIndex: 0, toIndex: 0, distanceMeters: 1_000, durationSeconds: 800 },
          { fromIndex: 0, toIndex: 1, distanceMeters: 100, durationSeconds: 80 },
        ]
      }
      return [
        { fromIndex: 0, toIndex: 0, distanceMeters: 200, durationSeconds: 160 },
        { fromIndex: 1, toIndex: 0, distanceMeters: 300, durationSeconds: 240 },
      ]
    }),
  }
}

function connectionKeys(connections: readonly { fromKey: string; toKey: string }[]): string[] {
  return connections.map(({ fromKey, toKey }) => `${fromKey} -> ${toKey}`).sort()
}

describe('walking connection provider', () => {
  it('uses exact directed stop-graph costs without requesting covered stop pairs', async () => {
    const routeEngine = createRouteEngine()
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: graph })

    const connections = await provider.getWalkingConnections({
      origin: { key: stopA.key, coordinate: stopA.coordinate },
      destination: { key: stopB.key, coordinate: stopB.coordinate },
      stops: [stopA, stopB],
    }, new AbortController().signal)

    expect(routeEngine.matrixWalking).not.toHaveBeenCalled()
    expect(connections).toHaveLength(2)
    expect(connections).toEqual(expect.arrayContaining([
      { fromKey: 'stop:STOP-A', toKey: 'stop:STOP-B', distanceMeters: 120, durationSeconds: 90 },
      { fromKey: 'stop:STOP-B', toKey: 'stop:STOP-A', distanceMeters: 140, durationSeconds: 110 },
    ]))
  })

  it('uses a live fallback when only the reverse directed graph edge exists', async () => {
    const routeEngine = createRouteEngine()
    const forwardOnlyGraph: WalkingStopGraph = {
      ...graph,
      connections: [graph.connections[0]],
    }
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: forwardOnlyGraph })

    const connections = await provider.getWalkingConnections({
      origin: { key: stopB.key, coordinate: stopB.coordinate },
      destination: { key: stopA.key, coordinate: stopA.coordinate },
      stops: [stopA, stopB],
    }, new AbortController().signal)

    expect(routeEngine.matrixWalking).toHaveBeenCalledOnce()
    expect(routeEngine.matrixWalking).toHaveBeenCalledWith({
      sources: [stopB.coordinate],
      targets: [stopA.coordinate],
    }, expect.any(AbortSignal))
    expect(connections).toEqual(expect.arrayContaining([
      { fromKey: stopA.key, toKey: stopB.key, distanceMeters: 120, durationSeconds: 90 },
      { fromKey: stopB.key, toKey: stopA.key, distanceMeters: 1_000, durationSeconds: 800 },
    ]))
  })

  it('combines two endpoint queries with the static directed stop graph', async () => {
    const routeEngine = createRouteEngine()
    const loadGraph = vi.fn(async () => graph)
    const provider = createWalkingConnectionProvider({ routeEngine, loadGraph })

    const connections = await provider.getWalkingConnections(request, new AbortController().signal)

    expect(connectionKeys(connections)).toEqual([
      'stop:STOP-A -> stop:STOP-B',
      'stop:STOP-A -> venue:destination',
      'stop:STOP-B -> stop:STOP-A',
      'stop:STOP-B -> venue:destination',
      'venue:origin -> stop:STOP-A',
      'venue:origin -> venue:destination',
    ])
    expect(routeEngine.matrixWalking).toHaveBeenCalledTimes(2)
    expect(routeEngine.matrixWalking).toHaveBeenCalledWith({
      sources: [origin.coordinate],
      targets: [destination.coordinate, stopA.coordinate, stopB.coordinate],
    }, expect.any(AbortSignal))
    expect(routeEngine.matrixWalking).toHaveBeenCalledWith({
      sources: [stopA.coordinate, stopB.coordinate],
      targets: [destination.coordinate],
    }, expect.any(AbortSignal))
    expect(connections).toContainEqual({
      fromKey: origin.key,
      toKey: destination.key,
      distanceMeters: 1_000,
      durationSeconds: 800,
    })
    expect(loadGraph).toHaveBeenCalledOnce()
  })

  it('keeps live non-stop cells and falls back only for a missing directed graph pair', async () => {
    const routeEngine = createRouteEngine()
    const partialGraph: WalkingStopGraph = {
      ...graph,
      stopIds: ['STOP-A', 'STOP-B', 'STOP-C'],
      connections: [
        graph.connections[0],
        graph.connections[1],
      ],
    }
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: partialGraph })
    const currentLocation = {
      key: 'current-location:origin',
      coordinate: { longitude: 103.004, latitude: 1.004 },
    }

    const connections = await provider.getWalkingConnections({
      origin: currentLocation,
      destination: { key: stopB.key, coordinate: stopB.coordinate },
      stops: [stopA, stopB, stopC],
    }, new AbortController().signal)

    expect(routeEngine.matrixWalking).toHaveBeenCalledTimes(2)
    expect(routeEngine.matrixWalking).toHaveBeenNthCalledWith(1, {
      sources: [currentLocation.coordinate],
      targets: [stopB.coordinate, stopA.coordinate, stopC.coordinate],
    }, expect.any(AbortSignal))
    expect(routeEngine.matrixWalking).toHaveBeenNthCalledWith(2, {
      sources: [stopC.coordinate],
      targets: [stopB.coordinate],
    }, expect.any(AbortSignal))
    expect(connections).toContainEqual({
      fromKey: currentLocation.key,
      toKey: stopB.key,
      distanceMeters: 1_000,
      durationSeconds: 800,
    })
    expect(connections).toContainEqual({
      fromKey: 'stop:STOP-A',
      toKey: 'stop:STOP-B',
      distanceMeters: 120,
      durationSeconds: 90,
    })
    expect(connections).toContainEqual({
      fromKey: 'stop:STOP-C',
      toKey: 'stop:STOP-B',
      distanceMeters: 1_000,
      durationSeconds: 800,
    })
  })

  it('uses the destination matrix for stop-to-destination pairs only once', async () => {
    const routeEngine = createRouteEngine()
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: graph })

    const connections = await provider.getWalkingConnections({
      origin: { key: stopA.key, coordinate: stopA.coordinate },
      destination,
      stops: [stopA, stopB],
    }, new AbortController().signal)

    expect(routeEngine.matrixWalking).toHaveBeenCalledOnce()
    expect(routeEngine.matrixWalking).toHaveBeenCalledWith({
      sources: [stopA.coordinate, stopB.coordinate],
      targets: [destination.coordinate],
    }, expect.any(AbortSignal))
    expect(connections).toContainEqual({
      fromKey: stopA.key,
      toKey: destination.key,
      distanceMeters: 200,
      durationSeconds: 160,
    })
  })

  it('omits same-key self cells without inventing a walking connection', async () => {
    const routeEngine = createRouteEngine()
    const singleStopGraph: WalkingStopGraph = {
      ...graph,
      stopIds: ['STOP-A'],
      connections: [],
    }
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: singleStopGraph })

    const connections = await provider.getWalkingConnections({
      origin: { key: stopA.key, coordinate: stopA.coordinate },
      destination: { key: stopA.key, coordinate: stopA.coordinate },
      stops: [stopA],
    }, new AbortController().signal)

    expect(routeEngine.matrixWalking).not.toHaveBeenCalled()
    expect(connections).toEqual([])
  })

  it('fails closed when the loaded graph does not match the request stops', async () => {
    const routeEngine = createRouteEngine()
    const mismatchedGraph: WalkingStopGraph = { ...graph, stopIds: ['STOP-A'] }
    const provider = createWalkingConnectionProvider({ routeEngine, walkingStopGraph: mismatchedGraph })

    await expect(provider.getWalkingConnections(request, new AbortController().signal))
      .rejects.toThrow('Walking stop graph does not match the loaded transit stops')
  })

  it('fails closed when the canonical graph cannot be loaded', async () => {
    const routeEngine = createRouteEngine()
    const loadGraph = vi.fn(async () => { throw new Error('walking graph unavailable') })
    const provider = createWalkingConnectionProvider({ routeEngine, loadGraph })

    await expect(provider.getWalkingConnections(request, new AbortController().signal))
      .rejects.toThrow('walking graph unavailable')
  })

  it('loads the static graph once and supports arbitrary endpoint coordinates', async () => {
    const routeEngine = createRouteEngine()
    const loadGraph = vi.fn(async () => graph)
    const provider = createWalkingConnectionProvider({ routeEngine, loadGraph })

    await provider.getWalkingConnections(request, new AbortController().signal)
    await provider.getWalkingConnections({
      ...request,
      origin: { ...origin, key: 'venue:other-origin', coordinate: { longitude: 103.02, latitude: 1.02 } },
    }, new AbortController().signal)

    expect(loadGraph).toHaveBeenCalledOnce()
    expect(routeEngine.matrixWalking).toHaveBeenCalledTimes(4)
  })
})

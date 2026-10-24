import type {
  WalkingConnection,
  WalkingConnectionProvider,
  WalkingConnectionRequest,
  WalkingMatrixConnection,
  WalkingRouteEngine,
} from './walking-contracts.ts'
import type { WalkingStopGraph } from '@nusgo/shared/routing/walking-stop-graph'
export type WalkingStopGraphLoader = (signal: AbortSignal) => Promise<WalkingStopGraph>

interface WalkingConnectionProviderOptions {
  readonly routeEngine: WalkingRouteEngine
  readonly walkingStopGraph?: WalkingStopGraph
  readonly loadGraph?: WalkingStopGraphLoader
}

function uniqueLocations(request: WalkingConnectionRequest): readonly WalkingConnectionRequest['origin'][] {
  const locations = new Map<string, WalkingConnectionRequest['origin']>()
  for (const location of request.stops) {
    if (!locations.has(location.key)) locations.set(location.key, location)
  }
  return [...locations.values()]
}

function addConnection(
  connections: Map<string, WalkingConnection>,
  connection: WalkingConnection,
): void {
  if (connection.fromKey === connection.toKey) return
  connections.set(connectionKey(connection.fromKey, connection.toKey), connection)
}

function connectionKey(fromKey: string, toKey: string): string {
  return `${fromKey}\u0000${toKey}`
}

function addMatrixConnections(
  connections: Map<string, WalkingConnection>,
  matrixConnections: readonly WalkingMatrixConnection[],
  sources: readonly WalkingConnectionRequest['origin'][],
  targets: readonly WalkingConnectionRequest['origin'][],
): void {
  for (const connection of matrixConnections) {
    const from = sources[connection.fromIndex]
    const to = targets[connection.toIndex]
    if (!from || !to) continue
    addConnection(connections, {
      fromKey: from.key,
      toKey: to.key,
      distanceMeters: connection.distanceMeters,
      durationSeconds: connection.durationSeconds,
    })
  }
}

function getStaticConnections(
  graph: WalkingStopGraph,
  stopLocations: readonly WalkingConnectionRequest['origin'][],
): readonly WalkingConnection[] {
  const locationByStopId = new Map(
    stopLocations.flatMap((location) => location.stopId
      ? [[location.stopId, location] as const]
      : []),
  )
  if (
    graph.stopIds.length !== locationByStopId.size ||
    graph.stopIds.some((stopId) => !locationByStopId.has(stopId))
  ) {
    throw new Error('Walking stop graph does not match the loaded transit stops')
  }

  const connections: WalkingConnection[] = []
  // Preserve graph direction: a walk from A to B does not imply that B to A is equivalent.
  for (const connection of graph.connections) {
    const fromStopId = connection.fromKey.slice('stop:'.length)
    const toStopId = connection.toKey.slice('stop:'.length)
    const from = locationByStopId.get(fromStopId)
    const to = locationByStopId.get(toStopId)
    if (!from || !to) {
      throw new Error('Walking stop graph does not match the loaded transit stops')
    }
    connections.push({
      fromKey: from.key,
      toKey: to.key,
      distanceMeters: connection.distanceMeters,
      durationSeconds: connection.durationSeconds,
    })
  }
  return connections
}

export function createWalkingConnectionProvider(
  options: WalkingConnectionProviderOptions,
): WalkingConnectionProvider {
  const loadGraph = options.loadGraph ?? (() => options.walkingStopGraph
    ? Promise.resolve(options.walkingStopGraph)
    : Promise.reject(new Error('Canonical walking stop graph is required')))
  let graph: WalkingStopGraph | null = null

  return {
    async getWalkingConnections(request, signal) {
      const stopLocations = uniqueLocations(request)
      const targets = [request.destination, ...stopLocations]
        .filter((location, index, locations) => (
          locations.findIndex((candidate) => candidate.key === location.key) === index
        ))
      const loadedGraph = graph ?? await loadGraph(signal)
      graph = loadedGraph
      const staticConnections = getStaticConnections(loadedGraph, stopLocations)
      const staticConnectionKeys = new Set(staticConnections.map(({ fromKey, toKey }) => (
        connectionKey(fromKey, toKey)
      )))
      const stopKeys = new Set(stopLocations.map(({ key }) => key))
      const endpointTargets = targets.filter((target) => {
        if (target.key === request.origin.key) return false

        const key = connectionKey(request.origin.key, target.key)
        if (stopKeys.has(request.origin.key) && stopKeys.has(target.key) && staticConnectionKeys.has(key)) {
          return false
        }
        // The destination column supplies this same stop-to-destination pair and takes precedence.
        if (target.key === request.destination.key && stopKeys.has(request.origin.key)) return false
        return true
      })
      const destinationSources = stopLocations.filter((source) => (
        source.key !== request.destination.key &&
        !staticConnectionKeys.has(connectionKey(source.key, request.destination.key))
      ))

      const [originConnections, destinationConnections] = await Promise.all([
        endpointTargets.length === 0
          ? Promise.resolve<readonly WalkingMatrixConnection[]>([])
          : options.routeEngine.matrixWalking({
            sources: [request.origin.coordinate],
            targets: endpointTargets.map((location) => location.coordinate),
          }, signal),
        destinationSources.length === 0
          ? Promise.resolve<readonly WalkingMatrixConnection[]>([])
          : options.routeEngine.matrixWalking({
            sources: destinationSources.map((location) => location.coordinate),
            targets: [request.destination.coordinate],
          }, signal),
      ])

      const connections = new Map<string, WalkingConnection>()
      addMatrixConnections(connections, originConnections, [request.origin], endpointTargets)
      addMatrixConnections(connections, destinationConnections, destinationSources, [request.destination])
      for (const connection of staticConnections) addConnection(connections, connection)
      return [...connections.values()]
    },
  }
}

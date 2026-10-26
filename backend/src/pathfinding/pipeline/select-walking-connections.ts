import type { TransitIndex } from '@nusgo/shared/transit/index'
import type { PathGeometry } from '../path.ts'
import { limitEndpointConnectors } from '../search/limit-endpoint-connectors.ts'
import {
  MAX_PATH_ENDPOINT_STOP_CONNECTORS,
  MAX_SELECTED_STOP_ENDPOINT_CONNECTORS,
} from '../search/search-path-candidates.ts'
import type { PathWalkingConnection } from '../search/search-path-candidates.ts'
import type {
  WalkingConnection,
  WalkingConnectionProvider,
} from '../walking/walking-contracts.ts'
import type { ResolvedPathEndpoints, ResolvedPathLocation } from './resolve-path-endpoints.ts'

interface WalkingCandidate {
  readonly from: ResolvedPathLocation
  readonly to: ResolvedPathLocation
  readonly connection: WalkingConnection
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function selectEndpointConnectors(
  candidates: readonly WalkingCandidate[],
  endpoint: ResolvedPathLocation,
  isOrigin: boolean,
  transit: TransitIndex,
): WalkingCandidate[] {
  const isSelectedStop = endpoint.endpoint.kind === 'stop'
  const maximumCount = isSelectedStop
    ? MAX_SELECTED_STOP_ENDPOINT_CONNECTORS
    : MAX_PATH_ENDPOINT_STOP_CONNECTORS
  const preferredStopId = isSelectedStop
    ? transit.stopById.get(endpoint.endpoint.id)?.opposite
    : undefined
  return limitEndpointConnectors(
    candidates,
    maximumCount,
    preferredStopId,
    (candidate) => {
      const connectedEndpoint = isOrigin ? candidate.to.endpoint : candidate.from.endpoint
      return connectedEndpoint.kind === 'stop' ? connectedEndpoint.id : ''
    },
  )
}

function isCandidatePair(
  from: ResolvedPathLocation,
  to: ResolvedPathLocation,
  endpoints: ResolvedPathEndpoints,
  transit: TransitIndex,
): boolean {
  if (from.key === to.key) return false
  if (from.key === endpoints.origin.key && to.key === endpoints.destination.key) return true
  if (
    from.key === endpoints.origin.key &&
    endpoints.origin.endpoint.kind === 'stop' &&
    to.endpoint.kind === 'stop'
  ) return true
  if (
    from.key === endpoints.origin.key &&
    from.endpoint.kind !== 'stop' &&
    to.endpoint.kind === 'stop'
  ) return true
  if (to.key === endpoints.destination.key && from.endpoint.kind === 'stop') return true
  if (from.endpoint.kind === 'stop' && to.endpoint.kind === 'stop') {
    const fromRoutes = transit.routeIdsByStopId.get(from.endpoint.id)
    const toRoutes = transit.routeIdsByStopId.get(to.endpoint.id)
    if (!fromRoutes || !toRoutes) return false
    // A walking transfer is useful only when it connects distinct bus routes.
    for (const fromRouteId of fromRoutes) {
      for (const toRouteId of toRoutes) {
        if (fromRouteId !== toRouteId) return true
      }
    }
    return false
  }
  return false
}

function selectWalkingCandidates(
  connections: readonly WalkingConnection[],
  endpoints: ResolvedPathEndpoints,
  transit: TransitIndex,
): WalkingCandidate[] {
  const locationByKey = new Map(endpoints.all.map((location) => [location.key, location]))
  const candidates = connections.flatMap((connection) => {
    const from = locationByKey.get(connection.fromKey)
    const to = locationByKey.get(connection.toKey)
    if (!from || !to || !isCandidatePair(from, to, endpoints, transit)) return []
    return [{ from, to, connection }]
  })

  const compareCandidates = (first: WalkingCandidate, second: WalkingCandidate) => (
    first.connection.durationSeconds - second.connection.durationSeconds ||
    first.connection.distanceMeters - second.connection.distanceMeters ||
    compareText(first.to.key, second.to.key) ||
    compareText(first.from.key, second.from.key)
  )
  const direct = candidates.filter((candidate) => (
    candidate.from.key === endpoints.origin.key && candidate.to.key === endpoints.destination.key
  ))
  // Keep venue fan-out bounded. A selected stop keeps its exact stop and one preferred walkable neighbor.
  const rankedOriginConnectors = candidates
    .filter((candidate) => (
      candidate.from.key === endpoints.origin.key && candidate.to.endpoint.kind === 'stop'
    ))
    .sort(compareCandidates)
  const originConnectors = selectEndpointConnectors(
    rankedOriginConnectors,
    endpoints.origin,
    true,
    transit,
  )
  const destinationConnectors = candidates
    .filter((candidate) => (
      candidate.from.endpoint.kind === 'stop' && candidate.to.key === endpoints.destination.key
    ))
    .sort(compareCandidates)
  const selectedDestinationConnectors = selectEndpointConnectors(
    destinationConnectors,
    endpoints.destination,
    false,
    transit,
  )
  const transferConnections = candidates.filter((candidate) => (
    candidate.from.endpoint.kind === 'stop' &&
    candidate.to.endpoint.kind === 'stop' &&
    candidate.from.key !== endpoints.origin.key &&
    candidate.to.key !== endpoints.origin.key &&
    candidate.from.key !== endpoints.destination.key &&
    candidate.to.key !== endpoints.destination.key
  ))
  return [...direct, ...originConnectors, ...selectedDestinationConnectors, ...transferConnections]
}

function toStraightLinePlaceholder(
  from: ResolvedPathLocation,
  to: ResolvedPathLocation,
): PathGeometry {
  return {
    type: 'LineString',
    coordinates: [
      [from.coordinate.longitude, from.coordinate.latitude],
      [to.coordinate.longitude, to.coordinate.latitude],
    ],
  }
}

function createSearchWalkingConnections(
  candidates: readonly WalkingCandidate[],
): readonly PathWalkingConnection[] {
  return candidates.map(({ from, to, connection }) => ({
    from: from.endpoint,
    to: to.endpoint,
    durationSeconds: connection.durationSeconds,
    distanceMeters: connection.distanceMeters,
    // Search uses a placeholder for cost; completePathGeometry must replace it before returning a Path.
    geometry: toStraightLinePlaceholder(from, to),
  } satisfies PathWalkingConnection))
}

function toStopLocations(endpoints: ResolvedPathEndpoints) {
  return endpoints.all
    .filter((location): location is ResolvedPathLocation & { endpoint: { kind: 'stop'; id: string } } => (
      location.endpoint.kind === 'stop'
    ))
    .map((location) => ({
      key: location.key,
      coordinate: location.coordinate,
      stopId: location.endpoint.id,
    }))
}

export async function selectWalkingConnections(
  endpoints: ResolvedPathEndpoints,
  transit: TransitIndex,
  provider: WalkingConnectionProvider,
  signal: AbortSignal,
): Promise<readonly PathWalkingConnection[]> {
  const connections = await provider.getWalkingConnections({
    origin: {
      key: endpoints.origin.key,
      coordinate: endpoints.origin.coordinate,
    },
    destination: {
      key: endpoints.destination.key,
      coordinate: endpoints.destination.coordinate,
    },
    stops: toStopLocations(endpoints),
  }, signal)

  const candidates = selectWalkingCandidates(connections, endpoints, transit)
  return createSearchWalkingConnections(candidates)
}

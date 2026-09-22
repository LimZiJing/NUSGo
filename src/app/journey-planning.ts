import type {
  RoutingCoordinate,
  WalkingMatrixConnection,
  WalkingRouteEngine,
} from './contracts/routing'
import type { LoadedTransitData } from './contracts/data'
import { planJourney, zeroShuttleWaitingTime, type WalkingJourneyConnection } from '../domain/trip/planner'
import type { Journey, JourneyEndpointLocation } from '../domain/trip/journey'
import type { TripEndpoint, TripRequest } from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'

export interface JourneyPlanningRequest {
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap
  readonly transit: LoadedTransitData
  readonly signal: AbortSignal
}

export type JourneyPlanningService = (
  request: JourneyPlanningRequest,
) => Promise<Journey | null>

interface ResolvedLocation extends JourneyEndpointLocation {
  readonly key: string
}

interface WalkingCandidate {
  readonly from: ResolvedLocation
  readonly to: ResolvedLocation
  readonly connection: WalkingMatrixConnection
}

function endpointKey(endpoint: TripEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`
}

function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value)
}

function toCoordinate(longitude: number, latitude: number): RoutingCoordinate | null {
  return isFiniteCoordinate(longitude) && isFiniteCoordinate(latitude)
    ? { longitude, latitude }
    : null
}

function resolveEndpoint(
  endpoint: TripEndpoint,
  venues: VenueLocationMap,
  transit: LoadedTransitData,
): ResolvedLocation | null {
  if (endpoint.kind === 'venue') {
    const location = venues[endpoint.id]?.location
    const coordinate = location ? toCoordinate(location.x, location.y) : null
    if (!coordinate) return null
    return {
      key: endpointKey(endpoint),
      endpoint,
      coordinate,
    }
  }

  const stop = transit.index.stopById.get(endpoint.id)
  const coordinate = stop ? toCoordinate(stop.longitude, stop.latitude) : null
  if (!coordinate) return null
  return {
    key: endpointKey(endpoint),
    endpoint,
    coordinate,
  }
}

function addLocation(
  locations: Map<string, ResolvedLocation>,
  location: ResolvedLocation,
): void {
  if (!locations.has(location.key)) locations.set(location.key, location)
}

function resolveLocations(
  request: JourneyPlanningRequest,
): { readonly origin: ResolvedLocation; readonly destination: ResolvedLocation; readonly all: readonly ResolvedLocation[] } | null {
  const originEndpoint = request.tripRequest.origin
  const destinationEndpoint = request.tripRequest.destination
  if (!originEndpoint || !destinationEndpoint) return null

  const origin = resolveEndpoint(originEndpoint, request.venues, request.transit)
  const destination = resolveEndpoint(destinationEndpoint, request.venues, request.transit)
  if (!origin || !destination || origin.key === destination.key) return null

  const locations = new Map<string, ResolvedLocation>()
  addLocation(locations, origin)
  addLocation(locations, destination)
  for (const stop of request.transit.index.stops) {
    const coordinate = toCoordinate(stop.longitude, stop.latitude)
    if (!coordinate) continue
    const endpoint: TripEndpoint = { kind: 'stop', id: stop.id }
    addLocation(locations, {
      key: endpointKey(endpoint),
      endpoint,
      coordinate,
    })
  }

  return { origin, destination, all: [...locations.values()] }
}

function isCandidatePair(
  from: ResolvedLocation,
  to: ResolvedLocation,
  originKey: string,
  destinationKey: string,
): boolean {
  if (from.key === to.key) return false
  const fromCanWalkToTransit = from.key === originKey || from.endpoint.kind === 'stop'
  const toCanWalkFromTransit = to.key === destinationKey || to.endpoint.kind === 'stop'
  const touchesTripEndpoint = from.key === originKey || to.key === destinationKey
  return fromCanWalkToTransit && toCanWalkFromTransit && touchesTripEndpoint
}

function selectWalkingCandidates(
  connections: readonly WalkingMatrixConnection[],
  locations: readonly ResolvedLocation[],
  originKey: string,
  destinationKey: string,
): WalkingCandidate[] {
  return connections.flatMap((connection) => {
    const from = locations[connection.fromIndex]
    const to = locations[connection.toIndex]
    if (!from || !to || !isCandidatePair(from, to, originKey, destinationKey)) return []
    return [{ from, to, connection }]
  })
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

function createAbortError(): Error {
  const error = new Error('The journey planning request was aborted')
  error.name = 'AbortError'
  return error
}

async function loadWalkingConnections(
  routeEngine: WalkingRouteEngine,
  candidates: readonly WalkingCandidate[],
  signal: AbortSignal,
): Promise<readonly WalkingJourneyConnection[]> {
  const results = await Promise.allSettled(candidates.map(async ({ from, to, connection }) => {
    const route = await routeEngine.routeWalking(
      { origin: from.coordinate, destination: to.coordinate },
      signal,
    )
    return {
      from: from.endpoint,
      to: to.endpoint,
      durationSeconds: connection.durationSeconds,
      distanceMeters: connection.distanceMeters,
      geometry: route.geometry,
    } satisfies WalkingJourneyConnection
  }))

  if (signal.aborted) throw createAbortError()

  const rejected = results.find((result) => result.status === 'rejected')
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<WalkingJourneyConnection> => result.status === 'fulfilled')
    .map((result) => result.value)
  if (fulfilled.length === 0 && rejected?.status === 'rejected' && !isAbortError(rejected.reason)) {
    throw rejected.reason
  }
  return fulfilled
}

export function createJourneyPlanningService(
  routeEngine: WalkingRouteEngine,
): JourneyPlanningService {
  return async (request) => {
    const locations = resolveLocations(request)
    if (!locations) return null

    const coordinates = locations.all.map((location) => location.coordinate)
    const matrixConnections = await routeEngine.matrixWalking({
      sources: coordinates,
      targets: coordinates,
    }, request.signal)
    if (request.signal.aborted) throw createAbortError()

    const candidates = selectWalkingCandidates(
      matrixConnections,
      locations.all,
      locations.origin.key,
      locations.destination.key,
    )
    const walkingConnections = await loadWalkingConnections(
      routeEngine,
      candidates,
      request.signal,
    )

    return planJourney({
      origin: locations.origin,
      destination: locations.destination,
      transitIndex: request.transit.index,
      routeGeometry: request.transit.geometry,
      shuttleTiming: request.transit.shuttleTiming,
      walkingConnections,
      getShuttleWaitingSeconds: zeroShuttleWaitingTime,
    })
  }
}

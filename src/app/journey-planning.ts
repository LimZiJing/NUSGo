import type {
  RoutingCoordinate,
  WalkingMatrixConnection,
  WalkingRouteEngine,
} from './contracts/routing'
import type { LoadedTransitData } from './contracts/data'
import {
  planJourney,
  zeroShuttleWaitingTime,
  type WalkingJourneyConnection,
} from '../domain/trip/planner'
import { createLiveShuttleWaitingTimeProvider } from '../domain/trip/live-waiting'
import {
  describeShuttleServiceUnavailable,
  evaluateShuttleService,
  type ShuttleServiceEvaluation,
  type ShuttleServiceWindow,
} from '../domain/transit/service-hours'
import type { Journey, JourneyEndpointLocation } from '../domain/trip/journey'
import type { TripEndpoint, TripRequest } from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'
import type { ShuttleArrivalClient, ShuttleArrivalStopRequest } from '../infrastructure/shuttle-arrivals/client'
import type { ShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'

export interface JourneyPlanningRequest {
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap
  readonly transit: LoadedTransitData
  readonly signal: AbortSignal
}

export type JourneyPlanningService = (
  request: JourneyPlanningRequest,
) => Promise<Journey | null>

export class NoJourneyAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoJourneyAvailableError'
  }
}

interface ResolvedLocation extends JourneyEndpointLocation {
  readonly key: string
}

interface WalkingCandidate {
  readonly from: ResolvedLocation
  readonly to: ResolvedLocation
  readonly connection: WalkingMatrixConnection
}

const MAX_ENDPOINT_WALK_SECONDS = 300
const MAX_STOP_TRANSFER_WALK_SECONDS = 180

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
  connection: WalkingMatrixConnection,
  transit: LoadedTransitData,
  originKey: string,
  destinationKey: string,
): boolean {
  if (from.key === to.key) return false
  const fromCanWalkToTransit = from.key === originKey || from.endpoint.kind === 'stop'
  const toCanWalkFromTransit = to.key === destinationKey || to.endpoint.kind === 'stop'
  const touchesTripEndpoint = from.key === originKey || to.key === destinationKey
  const isStopToStopTransfer = from.endpoint.kind === 'stop' && to.endpoint.kind === 'stop'
  if (!fromCanWalkToTransit || !toCanWalkFromTransit) return false
  if (from.key === originKey && to.key === destinationKey) return true

  const fromStop = transit.index.stopById.get(from.endpoint.id)
  const toStop = transit.index.stopById.get(to.endpoint.id)
  const isOppositePair = fromStop?.opposite === to.endpoint.id || toStop?.opposite === from.endpoint.id

  if (touchesTripEndpoint && !isStopToStopTransfer) {
    return connection.durationSeconds <= MAX_ENDPOINT_WALK_SECONDS
  }
  if (!isStopToStopTransfer) return true
  return isOppositePair || connection.durationSeconds <= MAX_STOP_TRANSFER_WALK_SECONDS
}

function selectWalkingCandidates(
  connections: readonly WalkingMatrixConnection[],
  locations: readonly ResolvedLocation[],
  transit: LoadedTransitData,
  originKey: string,
  destinationKey: string,
): WalkingCandidate[] {
  return connections.flatMap((connection) => {
    const from = locations[connection.fromIndex]
    const to = locations[connection.toIndex]
    if (!from || !to || !isCandidatePair(from, to, connection, transit, originKey, destinationKey)) return []
    return [{ from, to, connection }]
  })
}

function collectReachableStops(
  startStopIds: ReadonlySet<string>,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const reachable = new Set(startStopIds)
  const queue = [...startStopIds]
  while (queue.length > 0) {
    const stopId = queue.shift()!
    for (const nextStopId of edges.get(stopId) ?? []) {
      if (reachable.has(nextStopId)) continue
      reachable.add(nextStopId)
      queue.push(nextStopId)
    }
  }
  return reachable
}

function createTransitStopEdges(
  transit: LoadedTransitData,
  walkingConnections: readonly WalkingJourneyConnection[],
): {
  readonly forward: ReadonlyMap<string, ReadonlySet<string>>
  readonly reverse: ReadonlyMap<string, ReadonlySet<string>>
  readonly shuttleForward: ReadonlyMap<string, ReadonlySet<string>>
} {
  const forward = new Map<string, Set<string>>()
  const reverse = new Map<string, Set<string>>()
  const shuttleForward = new Map<string, Set<string>>()
  for (const stop of transit.index.stops) {
    forward.set(stop.id, new Set())
    reverse.set(stop.id, new Set())
    shuttleForward.set(stop.id, new Set())
  }
  for (const route of transit.index.routes) {
    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        const fromStopId = route.stopIds[fromIndex]
        const toStopId = route.stopIds[toIndex]
        if (fromStopId === toStopId) continue
        forward.get(fromStopId)?.add(toStopId)
        reverse.get(toStopId)?.add(fromStopId)
        shuttleForward.get(fromStopId)?.add(toStopId)
      }
    }
  }
  for (const connection of walkingConnections) {
    if (connection.from.kind !== 'stop' || connection.to.kind !== 'stop') continue
    forward.get(connection.from.id)?.add(connection.to.id)
    reverse.get(connection.to.id)?.add(connection.from.id)
  }
  return { forward, reverse, shuttleForward }
}

function collectEligibleBoardingStops(
  transit: LoadedTransitData,
  walkingConnections: readonly WalkingJourneyConnection[],
  origin: ResolvedLocation,
  destination: ResolvedLocation,
): readonly ShuttleArrivalStopRequest[] {
  const originStopIds = new Set<string>()
  if (origin.endpoint.kind === 'stop') originStopIds.add(origin.endpoint.id)
  for (const connection of walkingConnections) {
    if (
      endpointKey(connection.from) === origin.key &&
      connection.to.kind === 'stop'
    ) originStopIds.add(connection.to.id)
  }

  const destinationStopIds = new Set<string>()
  if (destination.endpoint.kind === 'stop') destinationStopIds.add(destination.endpoint.id)
  for (const connection of walkingConnections) {
    if (
      endpointKey(connection.to) === destination.key &&
      connection.from.kind === 'stop'
    ) destinationStopIds.add(connection.from.id)
  }
  if (originStopIds.size === 0 || destinationStopIds.size === 0) return []

  const { forward, reverse, shuttleForward } = createTransitStopEdges(
    transit,
    walkingConnections,
  )
  const reachableFromOrigin = collectReachableStops(originStopIds, forward)
  const canReachDestination = collectReachableStops(destinationStopIds, reverse)
  return transit.index.stops
    .filter((stop) => (
      reachableFromOrigin.has(stop.id) &&
      [...(shuttleForward.get(stop.id) ?? [])].some((nextStopId) => canReachDestination.has(nextStopId))
    ))
    .map((stop) => ({ stopId: stop.id, stopName: stop.longName }))
}

function collectEligibleRouteIds(
  transit: LoadedTransitData,
  boardingStops: readonly ShuttleArrivalStopRequest[],
): readonly string[] {
  const boardingStopIds = new Set(boardingStops.map((stop) => stop.stopId))
  return transit.index.routes
    .filter((route) => route.stopIds.some((stopId) => boardingStopIds.has(stopId)))
    .map((route) => route.id)
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

function createAbortError(): Error {
  const error = new Error('The journey planning request was aborted')
  error.name = 'AbortError'
  return error
}

function planWalkingOnly(
  planInput: Parameters<typeof planJourney>[0],
): Journey | null {
  return planJourney({
    ...planInput,
    getShuttleWaitingSeconds: () => null,
  })
}

function createPlanningWalkingGeometry(
  from: ResolvedLocation,
  to: ResolvedLocation,
): WalkingJourneyConnection['geometry'] {
  return {
    type: 'LineString',
    coordinates: [
      [from.coordinate.longitude, from.coordinate.latitude],
      [to.coordinate.longitude, to.coordinate.latitude],
    ],
  }
}

function getStaticServiceEvaluation(
  journey: Journey,
  serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>>,
  nowMs: number,
): ShuttleServiceEvaluation | null {
  let elapsedSeconds = 0
  for (const leg of journey.legs) {
    if (leg.mode === 'shuttle') {
      const windows = serviceWindows[leg.routeId]
      if (windows) {
        const evaluation = evaluateShuttleService(windows, new Date(nowMs + elapsedSeconds * 1000))
        if (evaluation.status !== 'active') return evaluation
      }
    }
    elapsedSeconds += leg.durationSeconds
  }
  return null
}

function createWalkingConnections(
  candidates: readonly WalkingCandidate[],
): readonly WalkingJourneyConnection[] {
  return candidates.map(({ from, to, connection }) => ({
      from: from.endpoint,
      to: to.endpoint,
      durationSeconds: connection.durationSeconds,
      distanceMeters: connection.distanceMeters,
      geometry: createPlanningWalkingGeometry(from, to),
    } satisfies WalkingJourneyConnection))
}

async function enrichWalkingGeometry(
  routeEngine: WalkingRouteEngine,
  journey: Journey,
  locations: readonly ResolvedLocation[],
  signal: AbortSignal,
): Promise<Journey> {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  const legs = await Promise.all(journey.legs.map(async (leg) => {
    if (leg.mode === 'shuttle') return leg
    const from = locationByKey.get(endpointKey(leg.from))
    const to = locationByKey.get(endpointKey(leg.to))
    if (!from || !to) throw new Error('Walking Journey leg has an unknown endpoint')
    const route = await routeEngine.routeWalking(
      { origin: from.coordinate, destination: to.coordinate },
      signal,
    )
    return { ...leg, geometry: route.geometry }
  }))

  if (signal.aborted) throw createAbortError()
  return { ...journey, legs }
}

export function createJourneyPlanningService(
  routeEngine: WalkingRouteEngine,
  shuttleArrivalClient?: ShuttleArrivalClient,
  shuttleServiceHoursClient?: ShuttleServiceHoursClient,
  now: () => number = Date.now,
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
      request.transit,
      locations.origin.key,
      locations.destination.key,
    )
    const walkingConnections = createWalkingConnections(candidates)

    const planInput = {
      origin: locations.origin,
      destination: locations.destination,
      transitIndex: request.transit.index,
      routeGeometry: request.transit.geometry,
      shuttleTiming: request.transit.shuttleTiming,
      walkingConnections,
      getShuttleWaitingSeconds: zeroShuttleWaitingTime,
    }
    const staticJourney = planJourney(planInput)
    if (!staticJourney) return null
    if (!shuttleArrivalClient) {
      return enrichWalkingGeometry(routeEngine, staticJourney, locations.all, request.signal)
    }

    const boardingStops = collectEligibleBoardingStops(
      request.transit,
      walkingConnections,
      locations.origin,
      locations.destination,
    )
    if (boardingStops.length === 0) {
      return enrichWalkingGeometry(routeEngine, staticJourney, locations.all, request.signal)
    }

    let serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null = null
    if (shuttleServiceHoursClient) {
      const routeIds = collectEligibleRouteIds(request.transit, boardingStops)
      if (routeIds.length === 0) return staticJourney
      try {
        serviceWindows = await shuttleServiceHoursClient.getServiceWindows(routeIds, request.signal)
      } catch (error: unknown) {
        if (request.signal.aborted || isAbortError(error)) throw createAbortError()
        console.warn('Shuttle service-hour data is unavailable; removing shuttle options.', error)
        const walkingOnlyJourney = planWalkingOnly(planInput)
        return walkingOnlyJourney
          ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
          : null
      }
      if (!routeIds.every((routeId) => serviceWindows?.[routeId] !== undefined)) {
        return planWalkingOnly(planInput)
      }
    }

    let liveArrivals
    try {
      liveArrivals = await shuttleArrivalClient.getArrivals([...boardingStops.values()], request.signal)
    } catch (error: unknown) {
      if (request.signal.aborted || isAbortError(error)) throw createAbortError()
      throw error
    }

    const liveWaiting = createLiveShuttleWaitingTimeProvider(liveArrivals)
    const nowMs = now()
    const liveJourney = planJourney({
      ...planInput,
      getShuttleWaitingSeconds: (record, context) => {
        const windows = serviceWindows?.[record.routeId]
        if (!windows) return liveWaiting(record, context)
        const service = evaluateShuttleService(windows, new Date(nowMs + context.elapsedSeconds * 1000))
        if (service.status !== 'active') return null
        return liveWaiting(record, context)
      },
    })
    if (liveJourney) {
      return enrichWalkingGeometry(routeEngine, liveJourney, locations.all, request.signal)
    }

    const unavailable = serviceWindows
      ? getStaticServiceEvaluation(staticJourney, serviceWindows, nowMs)
      : null
    if (unavailable) throw new NoJourneyAvailableError(describeShuttleServiceUnavailable(unavailable))
    const walkingOnlyJourney = planWalkingOnly(planInput)
    return walkingOnlyJourney
      ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
      : null
  }
}

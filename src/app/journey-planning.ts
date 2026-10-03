import type {
  WalkingConnection,
  WalkingConnectionProvider,
  RoutingCoordinate,
  WalkingRouteEngine,
} from './contracts/routing'
import type { LoadedTransitData } from './contracts/data'
import {
  planJourney,
  planJourneyWithinBudget,
  zeroShuttleWaitingTime,
  type JourneyPlanningResult,
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
import type { ShuttleArrivalClient, ShuttleArrivalStopRequest } from './contracts/shuttle-arrivals'
import type { ShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'
import { createTestShuttleWaitingTimeProvider } from '../domain/trip/journey-test-clock'

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
  readonly connection: WalkingConnection
}

const MAX_VENUE_STOP_CONNECTORS = 3
const JOURNEY_PLANNING_MAX_DURATION_MS = 350
const JOURNEY_PLANNING_MAX_EXPANDED_PATHS = 10_000
const JOURNEY_PLANNING_YIELD_EVERY = 64

function endpointKey(endpoint: TripEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
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
  if (from.key === originKey && to.key === destinationKey) return true
  if (from.key === originKey && from.endpoint.kind === 'venue' && to.endpoint.kind === 'stop') return true
  return to.key === destinationKey && to.endpoint.kind === 'venue' && from.endpoint.kind === 'stop'
}

function selectWalkingCandidates(
  connections: readonly WalkingConnection[],
  locations: readonly ResolvedLocation[],
  originKey: string,
  destinationKey: string,
): WalkingCandidate[] {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  const candidates = connections.flatMap((connection) => {
    const from = locationByKey.get(connection.fromKey)
    const to = locationByKey.get(connection.toKey)
    if (!from || !to || !isCandidatePair(from, to, originKey, destinationKey)) return []
    return [{ from, to, connection }]
  })

  const compareCandidates = (first: WalkingCandidate, second: WalkingCandidate) => (
    first.connection.durationSeconds - second.connection.durationSeconds ||
    first.connection.distanceMeters - second.connection.distanceMeters ||
    compareText(first.to.key, second.to.key) ||
    compareText(first.from.key, second.from.key)
  )
  const direct = candidates.filter((candidate) => (
    candidate.from.key === originKey && candidate.to.key === destinationKey
  ))
  const originConnectors = candidates
    .filter((candidate) => candidate.from.key === originKey && candidate.to.endpoint.kind === 'stop')
    .sort(compareCandidates)
    .slice(0, MAX_VENUE_STOP_CONNECTORS)
  const destinationConnectors = candidates
    .filter((candidate) => candidate.from.endpoint.kind === 'stop' && candidate.to.key === destinationKey)
    .sort(compareCandidates)
    .slice(0, MAX_VENUE_STOP_CONNECTORS)
  return [...direct, ...originConnectors, ...destinationConnectors]
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

  const eligibleBoardingIds = new Set<string>()
  for (const route of transit.index.routes) {
    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      const boardingStopId = route.stopIds[fromIndex]
      if (!originStopIds.has(boardingStopId)) continue
      if (route.stopIds.slice(fromIndex + 1).some((stopId) => destinationStopIds.has(stopId))) {
        eligibleBoardingIds.add(boardingStopId)
      }
    }
  }
  return transit.index.stops
    .filter((stop) => eligibleBoardingIds.has(stop.id))
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

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function planWithBudget(
  planInput: Parameters<typeof planJourney>[0],
  signal: AbortSignal,
): Promise<JourneyPlanningResult> {
  const result = await planJourneyWithinBudget(planInput, {
    maxDurationMs: JOURNEY_PLANNING_MAX_DURATION_MS,
    maxExpandedPaths: JOURNEY_PLANNING_MAX_EXPANDED_PATHS,
    shouldCancel: () => signal.aborted,
    yieldEvery: JOURNEY_PLANNING_YIELD_EVERY,
    yieldControl: yieldToBrowser,
  })
  if (result.status === 'cancelled' || signal.aborted) throw createAbortError()
  return result
}

async function planWalkingOnly(
  planInput: Parameters<typeof planJourney>[0],
  signal: AbortSignal,
): Promise<Journey | null> {
  const result = await planWithBudget({
    ...planInput,
    getShuttleWaitingSeconds: () => null,
  }, signal)
  return result.journey
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

async function getFullMatrixWalkingConnections(
  routeEngine: WalkingRouteEngine,
  locations: readonly ResolvedLocation[],
  signal: AbortSignal,
): Promise<readonly WalkingConnection[]> {
  const matrixConnections = await routeEngine.matrixWalking({
    sources: locations.map((location) => location.coordinate),
    targets: locations.map((location) => location.coordinate),
  }, signal)
  return matrixConnections.flatMap((connection) => {
    const from = locations[connection.fromIndex]
    const to = locations[connection.toIndex]
    if (!from || !to) return []
    return [{
      fromKey: from.key,
      toKey: to.key,
      distanceMeters: connection.distanceMeters,
      durationSeconds: connection.durationSeconds,
    }]
  })
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
  walkingConnectionProvider?: WalkingConnectionProvider,
  getTestDepartureMs: () => number | null = () => null,
): JourneyPlanningService {
  return async (request) => {
    const testDepartureMs = getTestDepartureMs()
    const locations = resolveLocations(request)
    if (!locations) return null

    const stopLocations = locations.all
      .filter((location): location is ResolvedLocation & { endpoint: { kind: 'stop'; id: string } } => (
        location.endpoint.kind === 'stop'
      ))
      .map((location) => ({
        key: location.key,
        coordinate: location.coordinate,
        stopId: location.endpoint.id,
      }))
    const walkingConnectionRequest = {
      origin: {
        key: locations.origin.key,
        coordinate: locations.origin.coordinate,
      },
      destination: {
        key: locations.destination.key,
        coordinate: locations.destination.coordinate,
      },
      stops: stopLocations,
    }
    const matrixConnections = walkingConnectionProvider
      ? await walkingConnectionProvider.getWalkingConnections(
        walkingConnectionRequest,
        request.signal,
      )
      : await getFullMatrixWalkingConnections(routeEngine, locations.all, request.signal)
    if (request.signal.aborted) throw createAbortError()

    const candidates = selectWalkingCandidates(
      matrixConnections,
      locations.all,
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
    const staticSearch = await planWithBudget(planInput, request.signal)
    const staticJourney = staticSearch.journey
    if (!staticJourney) {
      const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
      return walkingOnlyJourney
        ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
        : null
    }
    if (!shuttleArrivalClient && testDepartureMs === null) {
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
        const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
        return walkingOnlyJourney
          ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
          : null
      }
      if (!routeIds.every((routeId) => serviceWindows?.[routeId] !== undefined)) {
        const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
        return walkingOnlyJourney
          ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
          : null
      }
    }

    if (testDepartureMs !== null) {
      if (serviceWindows) {
        const testSearch = await planWithBudget({
          ...planInput,
          getShuttleWaitingSeconds: createTestShuttleWaitingTimeProvider(testDepartureMs, serviceWindows),
        }, request.signal)
        if (testSearch.journey) {
          return enrichWalkingGeometry(routeEngine, testSearch.journey, locations.all, request.signal)
        }
      }
      const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
      return walkingOnlyJourney
        ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
        : null
    }

    if (!shuttleArrivalClient) return null
    let liveArrivals
    try {
      liveArrivals = await shuttleArrivalClient.getArrivals([...boardingStops.values()], request.signal)
    } catch (error: unknown) {
      if (request.signal.aborted || isAbortError(error)) throw createAbortError()
      throw error
    }

    const nowMs = now()
    const liveWaiting = createLiveShuttleWaitingTimeProvider(liveArrivals, nowMs)
    const liveSearch = await planWithBudget({
      ...planInput,
      getShuttleWaitingSeconds: (record, context) => {
        const waitingSeconds = liveWaiting(record, context)
        if (waitingSeconds === null) return null
        const windows = serviceWindows?.[record.routeId]
        if (!windows) return waitingSeconds
        const boardingAtMs = nowMs + (context.elapsedSeconds + waitingSeconds) * 1000
        const service = evaluateShuttleService(windows, new Date(boardingAtMs))
        if (service.status !== 'active') return null
        return waitingSeconds
      },
    }, request.signal)
    const liveJourney = liveSearch.journey
    if (liveJourney) {
      return enrichWalkingGeometry(routeEngine, liveJourney, locations.all, request.signal)
    }

    const unavailable = serviceWindows
      ? getStaticServiceEvaluation(staticJourney, serviceWindows, nowMs)
      : null
    if (unavailable) throw new NoJourneyAvailableError(describeShuttleServiceUnavailable(unavailable))
    const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
    return walkingOnlyJourney
      ? enrichWalkingGeometry(routeEngine, walkingOnlyJourney, locations.all, request.signal)
      : null
  }
}

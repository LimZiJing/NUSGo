import type {
  WalkingConnection,
  WalkingConnectionProvider,
  RoutingCoordinate,
  WalkingRouteEngine,
} from './contracts/routing'
import type { LoadedTransitData } from './contracts/data'
import {
  getCandidateBoardingStopIds,
  planJourneyCandidates,
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
import type { ShuttleArrivalClient, ShuttleArrivalStopRequest } from './contracts/shuttle-arrivals'
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
  readonly connection: WalkingConnection
}

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
  connection: WalkingConnection,
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
    return true
  }
  if (!isStopToStopTransfer) return true
  return isOppositePair || connection.durationSeconds <= MAX_STOP_TRANSFER_WALK_SECONDS
}

function selectWalkingCandidates(
  connections: readonly WalkingConnection[],
  locations: readonly ResolvedLocation[],
  transit: LoadedTransitData,
  originKey: string,
  destinationKey: string,
): WalkingCandidate[] {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  return connections.flatMap((connection) => {
    const from = locationByKey.get(connection.fromKey)
    const to = locationByKey.get(connection.toKey)
    if (!from || !to || !isCandidatePair(from, to, connection, transit, originKey, destinationKey)) return []
    return [{ from, to, connection }]
  })
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

async function planWalkingOnly(
  planInput: Parameters<typeof planJourneyCandidates>[0],
  signal: AbortSignal,
): Promise<Journey | null> {
  if (signal.aborted) throw createAbortError()
  return planJourneyCandidates({
    ...planInput,
    getShuttleWaitingSeconds: () => null,
  })[0] ?? null
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
  journey: Journey | null,
  serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>>,
  nowMs: number,
): ShuttleServiceEvaluation | null {
  if (!journey) return null
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

async function enrichRankedJourneys(
  routeEngine: WalkingRouteEngine,
  journeys: readonly Journey[],
  locations: readonly ResolvedLocation[],
  signal: AbortSignal,
): Promise<Journey | null> {
  for (const journey of journeys) {
    try {
      return await enrichWalkingGeometry(routeEngine, journey, locations, signal)
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) throw createAbortError()
      console.warn('Walking route geometry was unavailable; trying the next Journey candidate.', error)
    }
  }
  return null
}

function planAndEnrich(
  routeEngine: WalkingRouteEngine,
  planInput: Parameters<typeof planJourneyCandidates>[0],
  locations: readonly ResolvedLocation[],
  signal: AbortSignal,
): Promise<Journey | null> {
  return enrichRankedJourneys(
    routeEngine,
    planJourneyCandidates(planInput),
    locations,
    signal,
  )
}

export function createJourneyPlanningService(
  routeEngine: WalkingRouteEngine,
  shuttleArrivalClient?: ShuttleArrivalClient,
  shuttleServiceHoursClient?: ShuttleServiceHoursClient,
  now: () => number = Date.now,
  walkingConnectionProvider?: WalkingConnectionProvider,
): JourneyPlanningService {
  return async (request) => {
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
    if (!shuttleArrivalClient) {
      return planAndEnrich(routeEngine, planInput, locations.all, request.signal)
    }

    const boardingStops = getCandidateBoardingStopIds(planInput)
      .flatMap((stopId) => {
        const stop = request.transit.index.stopById.get(stopId)
        return stop ? [{ stopId: stop.id, stopName: stop.longName }] : []
    })
    if (boardingStops.length === 0) {
      return planAndEnrich(routeEngine, planInput, locations.all, request.signal)
    }

    let serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null = null
    if (shuttleServiceHoursClient) {
      const routeIds = collectEligibleRouteIds(request.transit, boardingStops)
      if (routeIds.length === 0) {
        return planAndEnrich(routeEngine, planInput, locations.all, request.signal)
      }
      try {
        serviceWindows = await shuttleServiceHoursClient.getServiceWindows(routeIds, request.signal)
      } catch (error: unknown) {
        if (request.signal.aborted || isAbortError(error)) throw createAbortError()
        console.warn('Shuttle service-hour data is unavailable; removing shuttle options.', error)
        const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
        return walkingOnlyJourney
          ? enrichRankedJourneys(routeEngine, [walkingOnlyJourney], locations.all, request.signal)
          : null
      }
      if (!routeIds.every((routeId) => serviceWindows?.[routeId] !== undefined)) {
        const walkingOnlyJourney = await planWalkingOnly(planInput, request.signal)
        return walkingOnlyJourney
          ? enrichRankedJourneys(routeEngine, [walkingOnlyJourney], locations.all, request.signal)
          : null
      }
    }

    let liveArrivals
    try {
      liveArrivals = await shuttleArrivalClient.getArrivals([...boardingStops.values()], request.signal)
    } catch (error: unknown) {
      if (request.signal.aborted || isAbortError(error)) throw createAbortError()
      throw error
    }

    const nowMs = now()
    const liveWaiting = createLiveShuttleWaitingTimeProvider(liveArrivals, nowMs)
    const liveJourneys = planJourneyCandidates({
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
    })
    const liveJourney = await enrichRankedJourneys(
      routeEngine,
      liveJourneys,
      locations.all,
      request.signal,
    )
    if (liveJourney) return liveJourney

    // Static candidates are needed only to explain a service-window failure
    // after live timing removed every complete Journey.
    const staticJourneys = planJourneyCandidates(planInput)
    const unavailable = serviceWindows
      ? getStaticServiceEvaluation(staticJourneys[0] ?? null, serviceWindows, nowMs)
      : null
    if (unavailable) throw new NoJourneyAvailableError(describeShuttleServiceUnavailable(unavailable))
    return null
  }
}

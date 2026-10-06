import type {
  WalkingConnection,
  WalkingConnectionProvider,
  RoutingCoordinate,
  WalkingRouteEngine,
} from './contracts/routing'
import type { LoadedTransitData } from './contracts/data'
import {
  MAX_BUS_JOURNEY_CANDIDATES,
  MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS,
  searchJourneyCandidatesWithinBudget,
  zeroShuttleWaitingTime,
  type JourneyCandidateSearchResult,
  type JourneyPlanningStatus,
  type ScoredJourneyCandidate,
  type ShuttleWaitingTimeProvider,
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
import { getTripEndpointKey } from '../domain/trip/endpoints'
import { isValidLocationCoordinates } from '../domain/location/coordinates'
import type { VenueLocationMap } from '../domain/venue/types'
import type { ShuttleTimingRecord } from '../domain/transit/timing'
import type { ShuttleArrivalClient, ShuttleArrivalStopRequest } from './contracts/shuttle-arrivals'
import type { ShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'
import { createTestShuttleWaitingTimeProvider } from '../domain/trip/journey-test-clock'

export interface JourneyPlanningRequest {
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap
  readonly transit: LoadedTransitData
  readonly signal: AbortSignal
}

/** The best Journey plus the complete bounded candidate pool for downstream ranking/display. */
export interface JourneyPlanningServiceResult extends Journey {
  readonly candidates: readonly ScoredJourneyCandidate[]
  readonly status: JourneyPlanningStatus
  readonly expandedPathCount: number
  readonly indexBuildDurationMs: number
  readonly candidateResolutionDurationMs: number
  readonly candidateEnumerationStepCount: number
  readonly searchDurationMs: number
  readonly searchYieldWaitMs: number
  readonly searchCpuMs: number
  readonly maxSearchChunkDurationMs: number
  readonly geometrySliceCount: number
  readonly geometrySliceDurationMs: number
  readonly geometryCandidateChecks: number
  readonly geometryRouteRequests: number
  readonly geometryRouteCacheHits: number
}

export type JourneyPlanningService = (
  request: JourneyPlanningRequest,
) => Promise<JourneyPlanningServiceResult | null>

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

const JOURNEY_PLANNING_MAX_DURATION_MS = 350
const JOURNEY_PLANNING_MAX_EXPANDED_PATHS = 10_000
const JOURNEY_PLANNING_YIELD_EVERY = 64
const JOURNEY_SEARCH_DURATION_MS = 300

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
  if (endpoint.kind === 'current-location') {
    const { longitude, latitude } = endpoint.coordinate
    if (!isValidLocationCoordinates(longitude, latitude)) return null
    return {
      key: getTripEndpointKey(endpoint),
      endpoint,
      coordinate: { longitude, latitude },
    }
  }

  if (endpoint.kind === 'venue') {
    const location = venues[endpoint.id]?.location
    const coordinate = location ? toCoordinate(location.x, location.y) : null
    if (!coordinate) return null
    return {
      key: getTripEndpointKey(endpoint),
      endpoint,
      coordinate,
    }
  }

  const stop = transit.index.stopById.get(endpoint.id)
  const coordinate = stop ? toCoordinate(stop.longitude, stop.latitude) : null
  if (!coordinate) return null
  return {
    key: getTripEndpointKey(endpoint),
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
      key: getTripEndpointKey(endpoint),
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
  transit: LoadedTransitData,
): boolean {
  if (from.key === to.key) return false
  if (from.key === originKey && to.key === destinationKey) return true
  if (from.key === originKey && from.endpoint.kind !== 'stop' && to.endpoint.kind === 'stop') return true
  if (from.endpoint.kind === 'stop' && to.endpoint.kind === 'stop') {
    const fromRoutes = transit.index.routeIdsByStopId.get(from.endpoint.id)
    const toRoutes = transit.index.routeIdsByStopId.get(to.endpoint.id)
    if (!fromRoutes || !toRoutes) return false
    for (const fromRouteId of fromRoutes) {
      for (const toRouteId of toRoutes) {
        if (fromRouteId !== toRouteId) return true
      }
    }
    return false
  }
  return to.key === destinationKey && to.endpoint.kind !== 'stop' && from.endpoint.kind === 'stop'
}

function selectWalkingCandidates(
  connections: readonly WalkingConnection[],
  locations: readonly ResolvedLocation[],
  originKey: string,
  destinationKey: string,
  transit: LoadedTransitData,
): WalkingCandidate[] {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  const candidates = connections.flatMap((connection) => {
    const from = locationByKey.get(connection.fromKey)
    const to = locationByKey.get(connection.toKey)
    if (!from || !to || !isCandidatePair(from, to, originKey, destinationKey, transit)) return []
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
    .slice(0, MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS)
  const destinationConnectors = candidates
    .filter((candidate) => candidate.from.endpoint.kind === 'stop' && candidate.to.key === destinationKey)
    .sort(compareCandidates)
    .slice(0, MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS)
  const transferConnections = candidates.filter((candidate) => (
    candidate.from.endpoint.kind === 'stop' && candidate.to.endpoint.kind === 'stop'
  ))
  return [...direct, ...originConnectors, ...destinationConnectors, ...transferConnections]
}

function collectEligibleBoardingStops(
  transit: LoadedTransitData,
  search: JourneyCandidateSearchResult,
): readonly ShuttleArrivalStopRequest[] {
  const eligibleBoardingIds = new Set<string>()
  for (const { journey } of search.rankedCandidates) {
    for (const leg of journey.legs) {
      if (leg.mode === 'shuttle') eligibleBoardingIds.add(leg.boardingStopId)
    }
  }
  return transit.index.stops
    .filter((stop) => eligibleBoardingIds.has(stop.id))
    .map((stop) => ({ stopId: stop.id, stopName: stop.longName }))
}

function collectEligibleRouteIds(search: JourneyCandidateSearchResult): readonly string[] {
  const routeIds = new Set<string>()
  for (const { journey } of search.rankedCandidates) {
    for (const leg of journey.legs) {
      if (leg.mode === 'shuttle') routeIds.add(leg.routeId)
    }
  }
  return [...routeIds]
}

function shuttleTimingKey(routeId: string, boardingStopId: string, alightingStopId: string): string {
  return `${routeId}\u0000${boardingStopId}\u0000${alightingStopId}`
}

function compareScoredCandidates(
  first: ScoredJourneyCandidate,
  second: ScoredJourneyCandidate,
): number {
  const shuttleBoardings = (candidate: ScoredJourneyCandidate) => (
    candidate.journey.legs.filter((leg) => leg.mode === 'shuttle').length
  )
  const walkingDistance = (candidate: ScoredJourneyCandidate) => (
    candidate.journey.legs.reduce((total, leg) => (
      total + (leg.mode === 'walking' ? leg.distanceMeters : 0)
    ), 0)
  )
  return first.adjustedDurationSeconds - second.adjustedDurationSeconds ||
    shuttleBoardings(first) - shuttleBoardings(second) ||
    walkingDistance(first) - walkingDistance(second) ||
    first.journey.legs.length - second.journey.legs.length ||
    compareText(first.candidateKey, second.candidateKey)
}

function scoreCandidatesWithWaiting(
  search: JourneyCandidateSearchResult,
  timingRecords: readonly ShuttleTimingRecord[],
  getShuttleWaitingSeconds: ShuttleWaitingTimeProvider,
  serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null,
  departureMs: number,
  signal: AbortSignal,
  deadlineAtMs: number,
): JourneyCandidateSearchResult {
  const timingByKey = new Map(timingRecords.map((record) => [
    shuttleTimingKey(record.routeId, record.fromStopId, record.toStopId),
    record,
  ]))
  const rankedCandidates = search.rankedCandidates.filter(isWalkingOnlyCandidate)
  let status = search.status

  for (const candidate of search.rankedCandidates) {
    if (isWalkingOnlyCandidate(candidate)) continue
    if (signal.aborted) throw createAbortError()
    if (performance.now() >= deadlineAtMs) {
      status = 'budget-exceeded'
      break
    }
    let elapsedSeconds = 0
    let adjustedDurationSeconds = 0
    let shuttleBoardings = 0
    let valid = true
    const legs: Journey['legs'][number][] = []

    for (const leg of candidate.journey.legs) {
      if (leg.mode === 'walking') {
        legs.push(leg)
        elapsedSeconds += leg.durationSeconds
        adjustedDurationSeconds += leg.durationSeconds / 0.8
        continue
      }

      const record = timingByKey.get(shuttleTimingKey(
        leg.routeId,
        leg.boardingStopId,
        leg.alightingStopId,
      ))
      if (!record) {
        valid = false
        break
      }
      const waitingSeconds = getShuttleWaitingSeconds(record, {
        routeId: leg.routeId,
        boardingStopId: leg.boardingStopId,
        elapsedSeconds,
      })
      if (waitingSeconds === null || !Number.isFinite(waitingSeconds) || waitingSeconds < 0) {
        valid = false
        break
      }
      const windows = serviceWindows?.[leg.routeId]
      if (windows) {
        const service = evaluateShuttleService(
          windows,
          new Date(departureMs + (elapsedSeconds + waitingSeconds) * 1000),
        )
        if (service.status !== 'active') {
          valid = false
          break
        }
      }

      const durationSeconds = waitingSeconds + leg.rideSeconds
      legs.push({ ...leg, durationSeconds, waitingSeconds })
      elapsedSeconds += durationSeconds
      adjustedDurationSeconds += durationSeconds / (shuttleBoardings > 0 ? 0.9 : 1)
      shuttleBoardings += 1
    }

    if (!valid) continue
    rankedCandidates.push({
      ...candidate,
      adjustedDurationSeconds,
      score: adjustedDurationSeconds === 0 ? Number.POSITIVE_INFINITY : 1 / adjustedDurationSeconds,
      journey: {
        ...candidate.journey,
        totalDurationSeconds: elapsedSeconds,
        legs,
      },
    })
  }

  rankedCandidates.sort(compareScoredCandidates)
  return { ...search, status, rankedCandidates }
}

function isWalkingOnlyCandidate(candidate: ScoredJourneyCandidate): boolean {
  return candidate.journey.legs.every((leg) => leg.mode === 'walking')
}

function walkingOnlySearch(search: JourneyCandidateSearchResult): JourneyCandidateSearchResult {
  return {
    ...search,
    rankedCandidates: search.rankedCandidates.filter(isWalkingOnlyCandidate),
  }
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
  const schedulerWithYield = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> }
  }).scheduler
  if (schedulerWithYield?.yield) return schedulerWithYield.yield()

  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(undefined)
    })
  }

  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function planWithBudget(
  planInput: Parameters<typeof searchJourneyCandidatesWithinBudget>[0],
  signal: AbortSignal,
  deadlineAtMs: number,
  maxDurationMs = JOURNEY_PLANNING_MAX_DURATION_MS,
): Promise<JourneyCandidateSearchResult> {
  const result = await searchJourneyCandidatesWithinBudget(planInput, {
    maxDurationMs,
    deadlineAtMs,
    maxExpandedPaths: JOURNEY_PLANNING_MAX_EXPANDED_PATHS,
    shouldCancel: () => signal.aborted,
    yieldEvery: JOURNEY_PLANNING_YIELD_EVERY,
    yieldControl: yieldToBrowser,
    now: () => performance.now(),
  })
  if (result.status === 'cancelled' || signal.aborted) throw createAbortError()
  return result
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

function isValidWalkingGeometry(geometry: Journey['legs'][number]['geometry']): boolean {
  return geometry.type === 'LineString' &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(([longitude, latitude]) => (
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    ))
}

function createDeadlineSignal(signal: AbortSignal, deadlineAtMs: number) {
  const controller = new AbortController()
  const abortFromRequest = () => controller.abort(createAbortError())
  if (signal.aborted) abortFromRequest()
  else signal.addEventListener('abort', abortFromRequest, { once: true })
  const remainingMs = Math.max(0, deadlineAtMs - performance.now())
  const timeout = setTimeout(() => {
    const timeoutError = new Error('Journey geometry enrichment exceeded its time budget')
    timeoutError.name = 'TimeoutError'
    controller.abort(timeoutError)
  }, remainingMs)
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortFromRequest)
    },
  }
}

async function enrichCandidatePool(
  routeEngine: WalkingRouteEngine,
  search: JourneyCandidateSearchResult,
  locations: readonly ResolvedLocation[],
  signal: AbortSignal,
  deadlineAtMs: number,
): Promise<JourneyPlanningServiceResult | null> {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  const routePromises = new Map<string, Promise<Journey['legs'][number]['geometry']>>()
  const deadline = createDeadlineSignal(signal, deadlineAtMs)
  const candidates: ScoredJourneyCandidate[] = []
  let geometryCandidateChecks = 0
  let geometryRouteRequests = 0
  let geometryRouteCacheHits = 0
  let status = search.status
  let lastGeometryError: unknown = null

  const getRouteGeometry = (
    from: ResolvedLocation,
    to: ResolvedLocation,
  ): Promise<Journey['legs'][number]['geometry']> => {
    if (deadline.signal.aborted) {
      return Promise.reject(deadline.signal.reason ?? new Error('Walking geometry deadline exceeded'))
    }
    const key = `${from.key}\u0000${to.key}`
    const cached = routePromises.get(key)
    if (cached) {
      geometryRouteCacheHits += 1
      return cached
    }
    geometryRouteRequests += 1
    const promise = routeEngine.routeWalking(
      { origin: from.coordinate, destination: to.coordinate },
      deadline.signal,
    ).then(({ geometry }) => {
      if (!isValidWalkingGeometry(geometry)) throw new Error('Walking route returned incomplete geometry')
      return geometry
    })
    routePromises.set(key, promise)
    return promise
  }

  const preparedGeometry = new Map<ScoredJourneyCandidate, Promise<Journey['legs']>>()
  const prepareCandidateGeometry = (candidate: ScoredJourneyCandidate): Promise<Journey['legs']> => (
    Promise.all(candidate.journey.legs.map(async (leg) => {
      if (leg.mode === 'shuttle') return leg
      const from = locationByKey.get(getTripEndpointKey(leg.from))
      const to = locationByKey.get(getTripEndpointKey(leg.to))
      if (!from || !to) throw new Error('Walking Journey leg has an unknown endpoint')
      return { ...leg, geometry: await getRouteGeometry(from, to) }
    }))
  )

  try {
    let preferredBusCount = 0
    let preferredWalkingFound = false
    for (const candidate of search.rankedCandidates) {
      const isBus = candidate.journey.legs.some((leg) => leg.mode === 'shuttle')
      if (isBus) {
        if (preferredBusCount >= MAX_BUS_JOURNEY_CANDIDATES) continue
        preferredBusCount += 1
      } else {
        if (preferredWalkingFound) continue
        preferredWalkingFound = true
      }
      const promise = prepareCandidateGeometry(candidate)
      void promise.catch(() => undefined)
      preparedGeometry.set(candidate, promise)
      if (preferredBusCount >= MAX_BUS_JOURNEY_CANDIDATES && preferredWalkingFound) break
    }

    let busCandidateCount = 0
    let walkingCandidateFound = false
    for (const candidate of search.rankedCandidates) {
      if (signal.aborted) throw createAbortError()
      if (performance.now() >= deadlineAtMs) {
        status = 'budget-exceeded'
        break
      }

      const isBus = candidate.journey.legs.some((leg) => leg.mode === 'shuttle')
      if (
        (isBus && busCandidateCount >= MAX_BUS_JOURNEY_CANDIDATES) ||
        (!isBus && walkingCandidateFound)
      ) continue
      geometryCandidateChecks += 1
      let valid = true
      try {
        const legs = await (preparedGeometry.get(candidate) ?? prepareCandidateGeometry(candidate))
        if (deadline.signal.aborted) {
          if (signal.aborted) throw createAbortError()
          status = 'budget-exceeded'
          break
        }
        if (legs.some((leg) => leg.mode === 'walking' && !isValidWalkingGeometry(leg.geometry))) {
          valid = false
        } else {
          candidates.push({
            ...candidate,
            journey: { ...candidate.journey, legs },
          })
          if (isBus) busCandidateCount += 1
          else walkingCandidateFound = true
        }
      } catch (error: unknown) {
        if (signal.aborted || isAbortError(error)) {
          if (signal.aborted) throw createAbortError()
          if (deadline.signal.aborted) {
            status = 'budget-exceeded'
            break
          }
        }
        valid = false
        lastGeometryError = error
      }
      if (!valid && deadline.signal.aborted) {
        status = 'budget-exceeded'
        break
      }
      if (busCandidateCount >= MAX_BUS_JOURNEY_CANDIDATES && walkingCandidateFound) break
    }
  } finally {
    deadline.dispose()
  }

  if (signal.aborted) throw createAbortError()
  if (candidates.length === 0 && search.rankedCandidates.length > 0 && lastGeometryError) {
    throw lastGeometryError
  }

  const planningQuality: Journey['planningQuality'] = status === 'complete' ? 'exact' : 'bounded'
  const enrichedCandidates = candidates.map((candidate) => ({
    ...candidate,
    journey: { ...candidate.journey, planningQuality },
  }))
  const primaryCandidate = enrichedCandidates[0]
  if (!primaryCandidate) return null
  return {
    ...primaryCandidate.journey,
    candidates: enrichedCandidates,
    status,
    expandedPathCount: search.expandedPathCount,
    indexBuildDurationMs: search.indexBuildDurationMs,
    candidateResolutionDurationMs: search.candidateResolutionDurationMs,
    candidateEnumerationStepCount: search.candidateEnumerationStepCount,
    searchDurationMs: search.searchDurationMs,
    searchYieldWaitMs: search.searchYieldWaitMs,
    searchCpuMs: search.searchCpuMs,
    maxSearchChunkDurationMs: search.maxSearchChunkDurationMs,
    geometrySliceCount: search.geometrySliceCount,
    geometrySliceDurationMs: search.geometrySliceDurationMs,
    geometryCandidateChecks,
    geometryRouteRequests,
    geometryRouteCacheHits,
  }
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
      request.transit,
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
    const staticSearchStartedAtMs = performance.now()
    const staticDeadlineAtMs = staticSearchStartedAtMs + JOURNEY_PLANNING_MAX_DURATION_MS
    const staticSearch = await planWithBudget(
      planInput,
      request.signal,
      staticDeadlineAtMs,
      JOURNEY_SEARCH_DURATION_MS,
    )
    const remainingSearchBudgetMs = Math.max(
      0,
      JOURNEY_PLANNING_MAX_DURATION_MS - (performance.now() - staticSearchStartedAtMs),
    )
    const staticBusJourney = staticSearch.rankedCandidates.find(({ journey }) => (
      journey.legs.some((leg) => leg.mode === 'shuttle')
    ))?.journey ?? null
    if (!shuttleArrivalClient && testDepartureMs === null) {
      return enrichCandidatePool(routeEngine, staticSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
    }

    const boardingStops = collectEligibleBoardingStops(
      request.transit,
      staticSearch,
    )
    if (boardingStops.length === 0) {
      return enrichCandidatePool(routeEngine, staticSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
    }

    let serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null = null
    if (shuttleServiceHoursClient) {
      const routeIds = collectEligibleRouteIds(staticSearch)
      if (routeIds.length === 0) {
        return enrichCandidatePool(routeEngine, staticSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
      }
      try {
        serviceWindows = await shuttleServiceHoursClient.getServiceWindows(routeIds, request.signal)
      } catch (error: unknown) {
        if (request.signal.aborted || isAbortError(error)) throw createAbortError()
        console.warn('Shuttle service-hour data is unavailable; removing shuttle options.', error)
        const walkingSearch = walkingOnlySearch(staticSearch)
        return enrichCandidatePool(routeEngine, walkingSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
      }
      if (!routeIds.every((routeId) => serviceWindows?.[routeId] !== undefined)) {
        const walkingSearch = walkingOnlySearch(staticSearch)
        return enrichCandidatePool(routeEngine, walkingSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
      }
    }

    if (testDepartureMs !== null) {
      if (serviceWindows) {
        const testSearch = scoreCandidatesWithWaiting(
          staticSearch,
          request.transit.shuttleTiming.records,
          createTestShuttleWaitingTimeProvider(testDepartureMs, serviceWindows),
          serviceWindows,
          testDepartureMs,
          request.signal,
          performance.now() + remainingSearchBudgetMs,
        )
        if (testSearch.rankedCandidates.some(({ journey }) => (
          journey.legs.some((leg) => leg.mode === 'shuttle')
        ))) {
          return enrichCandidatePool(routeEngine, testSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
        }
        return enrichCandidatePool(routeEngine, walkingOnlySearch(testSearch), locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
      }
      return enrichCandidatePool(routeEngine, staticSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
    }

    if (!shuttleArrivalClient) {
      return enrichCandidatePool(routeEngine, staticSearch, locations.all, request.signal, staticDeadlineAtMs)
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
    const liveSearch = scoreCandidatesWithWaiting(
      staticSearch,
      request.transit.shuttleTiming.records,
      liveWaiting,
      serviceWindows,
      nowMs,
      request.signal,
      performance.now() + remainingSearchBudgetMs,
    )
    const liveHasShuttleCandidate = liveSearch.rankedCandidates.some(({ journey }) => (
      journey.legs.some((leg) => leg.mode === 'shuttle')
    ))
    if (liveHasShuttleCandidate) {
      return enrichCandidatePool(routeEngine, liveSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
    }

    const unavailable = serviceWindows && staticBusJourney
      ? getStaticServiceEvaluation(staticBusJourney, serviceWindows, nowMs)
      : null
    if (
      unavailable &&
      !liveSearch.rankedCandidates.some(isWalkingOnlyCandidate)
    ) throw new NoJourneyAvailableError(describeShuttleServiceUnavailable(unavailable))
    const walkingSearch = walkingOnlySearch(liveSearch)
    return enrichCandidatePool(routeEngine, walkingSearch, locations.all, request.signal, performance.now() + JOURNEY_PLANNING_MAX_DURATION_MS)
  }
}

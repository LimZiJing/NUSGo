import type { TransitIndex } from '../transit'
import type {
  ShuttleTimingData,
  ShuttleTimingRecord,
} from '@navus/shared/transit/timing'
import type {
  TransitGeoJsonPosition,
  TransitRouteGeometry,
} from '@navus/shared/transit/types'
import type { TripEndpoint } from './types'
import { getTripEndpointKey } from './endpoints'
import type {
  Journey,
  JourneyEndpointLocation,
  JourneyLineString,
  JourneyLeg,
  JourneyPlanningQuality,
  ShuttleJourneyLeg,
  WalkingJourneyLeg,
} from './journey'

export interface WalkingJourneyConnection {
  readonly from: TripEndpoint
  readonly to: TripEndpoint
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly geometry: JourneyLineString
}

export interface ShuttleWaitingTimeContext {
  readonly routeId: string
  readonly boardingStopId: string
  readonly elapsedSeconds: number
}

export type ShuttleWaitingTimeProvider = (
  record: ShuttleTimingRecord,
  context: ShuttleWaitingTimeContext,
) => number | null

export const zeroShuttleWaitingTime: ShuttleWaitingTimeProvider = () => 0

export interface JourneyPlanningOptions {
  readonly maxDurationMs?: number
  /** Optional monotonic deadline shared with downstream candidate enrichment. */
  readonly deadlineAtMs?: number
  readonly maxExpandedPaths?: number
  readonly shouldCancel?: () => boolean
  readonly yieldEvery?: number
  readonly yieldControl?: () => Promise<void>
  readonly now?: () => number
}

export type JourneyPlanningStatus = 'complete' | 'budget-exceeded' | 'cancelled'

export interface ScoredJourneyCandidate {
  readonly candidateKey: string
  readonly journey: Journey
  readonly adjustedDurationSeconds: number
  readonly score: number
}

export interface JourneyPlanningResult {
  /** The highest-scoring candidate, retained for callers that only need one Journey. */
  readonly journey: Journey | null
  /** Up to three distinct shuttle Journeys plus the highest-scoring walking-only Journey. */
  readonly candidates: readonly ScoredJourneyCandidate[]
  readonly status: JourneyPlanningStatus
  readonly expandedPathCount: number
  readonly indexBuildDurationMs: number
  readonly candidateResolutionDurationMs: number
  readonly candidateEnumerationStepCount: number
  /** Search wall time, including cooperative yields but excluding network and geometry enrichment. */
  readonly searchDurationMs: number
  /** Time spent yielding to the host event loop during search. */
  readonly searchYieldWaitMs: number
  /** Search wall time with cooperative yield wait removed. */
  readonly searchCpuMs: number
  /** Longest synchronous search slice between opportunities for host event processing. */
  readonly maxSearchChunkDurationMs: number
  readonly geometrySliceCount: number
  readonly geometrySliceDurationMs: number
}

export interface JourneyCandidateSearchResult {
  /** Ranked complete candidates considered by the bounded search for downstream geometry checks. */
  readonly rankedCandidates: readonly ScoredJourneyCandidate[]
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
}

export interface PlanJourneyInput {
  readonly origin: JourneyEndpointLocation
  readonly destination: JourneyEndpointLocation
  readonly transitIndex: TransitIndex
  readonly routeGeometry: TransitRouteGeometry
  readonly shuttleTiming: ShuttleTimingData
  readonly walkingConnections: readonly WalkingJourneyConnection[]
  readonly getShuttleWaitingSeconds: ShuttleWaitingTimeProvider
}

interface ProjectedPoint {
  readonly segmentIndex: number
  readonly distanceAlongLine: number
  readonly distanceToLine: number
  readonly coordinate: TransitGeoJsonPosition
}

interface WalkingConnector {
  readonly stopId: string
  readonly connection: WalkingJourneyConnection | null
}

interface ShuttleRideDefinition {
  readonly routeId: string
  readonly fromStopId: string
  readonly toStopId: string
  readonly traversedStopIds: ReadonlySet<string>
  readonly rideSeconds: number
  readonly record: ShuttleTimingRecord
  readonly geometryLine: readonly TransitGeoJsonPosition[]
}

interface TransferOption {
  readonly connection: WalkingJourneyConnection
  readonly ride: ShuttleRideDefinition
  readonly destinationConnector: WalkingConnector
}

interface JourneySearchIndex {
  readonly originConnectors: readonly WalkingConnector[]
  readonly destinationConnectorByStopId: ReadonlyMap<string, WalkingConnector>
  readonly directWalkingConnections: readonly WalkingJourneyConnection[]
  readonly ridesByBoardingStopId: ReadonlyMap<string, readonly ShuttleRideDefinition[]>
  readonly transferOptionsByAlightingStopAndRoute: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly TransferOption[]>
  >
  readonly getRideGeometry: (ride: ShuttleRideDefinition) => {
    readonly geometry: JourneyLineString
    readonly distanceMeters: number
  } | null
  readonly getRideGeometryMetrics: () => {
    readonly buildCount: number
    readonly buildDurationMs: number
  }
}

interface DirectWalkingCandidateDefinition {
  readonly kind: 'walking'
  readonly connection: WalkingJourneyConnection
}

interface ShuttleCandidateDefinition {
  readonly kind: 'shuttle'
  readonly originConnector: WalkingConnector
  readonly rides: readonly [ShuttleRideDefinition] | readonly [ShuttleRideDefinition, ShuttleRideDefinition]
  readonly transferConnection?: WalkingJourneyConnection
  readonly destinationConnector: WalkingConnector
}

type JourneyCandidateDefinition = DirectWalkingCandidateDefinition | ShuttleCandidateDefinition

type CandidateEnumerationStep =
  | { readonly kind: 'work' }
  | { readonly kind: 'candidate'; readonly definition: JourneyCandidateDefinition }

interface JourneyCandidate {
  readonly legs: readonly JourneyLeg[]
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly adjustedDurationSeconds: number
  readonly score: number
  readonly candidateKey: string
  readonly sequenceKey: string
}

interface CandidateCollector {
  readonly busByKey: Map<string, JourneyCandidate>
  readonly walkingByKey: Map<string, JourneyCandidate>
}

const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320
const PROJECTION_EPSILON_METRES = 0.001
export const MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS = 5
export const MAX_BUS_JOURNEY_CANDIDATES = 3

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function isFiniteNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0
}

function isValidLineString(geometry: JourneyLineString): boolean {
  return geometry.type === 'LineString' &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(([longitude, latitude]) => (
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    ))
}

function toPosition(longitude: number, latitude: number): TransitGeoJsonPosition {
  return [longitude, latitude]
}

function toLocalMeters(
  position: TransitGeoJsonPosition,
  referenceLatitude: number,
): [number, number] {
  const longitudeScale = METRES_PER_LONGITUDE_DEGREE * Math.cos(referenceLatitude * Math.PI / 180)
  return [position[0] * longitudeScale, position[1] * METRES_PER_LATITUDE_DEGREE]
}

function distanceBetween(
  first: TransitGeoJsonPosition,
  second: TransitGeoJsonPosition,
): number {
  const referenceLatitude = (first[1] + second[1]) / 2
  const firstMeters = toLocalMeters(first, referenceLatitude)
  const secondMeters = toLocalMeters(second, referenceLatitude)
  return Math.hypot(secondMeters[0] - firstMeters[0], secondMeters[1] - firstMeters[1])
}

function projectPointOntoLine(
  point: TransitGeoJsonPosition,
  line: readonly TransitGeoJsonPosition[],
): readonly ProjectedPoint[] {
  let distanceAlongLine = 0
  const candidates: ProjectedPoint[] = []

  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1]
    const end = line[index]
    const segmentLength = distanceBetween(start, end)
    const pointMeters = toLocalMeters(point, point[1])
    const startMeters = toLocalMeters(start, point[1])
    const endMeters = toLocalMeters(end, point[1])
    const deltaX = endMeters[0] - startMeters[0]
    const deltaY = endMeters[1] - startMeters[1]
    const lengthSquared = deltaX * deltaX + deltaY * deltaY
    const ratio = lengthSquared === 0
      ? 0
      : Math.max(
        0,
        Math.min(
          1,
          ((pointMeters[0] - startMeters[0]) * deltaX +
            (pointMeters[1] - startMeters[1]) * deltaY) / lengthSquared,
        ),
      )
    const projected: TransitGeoJsonPosition = [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ]
    candidates.push({
      segmentIndex: index,
      distanceAlongLine: distanceAlongLine + segmentLength * ratio,
      distanceToLine: distanceBetween(point, projected),
      coordinate: projected,
    })
    distanceAlongLine += segmentLength
  }

  return candidates.sort((first, second) => first.distanceAlongLine - second.distanceAlongLine)
}

function withoutDuplicateCoordinates(
  coordinates: readonly TransitGeoJsonPosition[],
): readonly TransitGeoJsonPosition[] {
  return coordinates.filter((coordinate, index) => {
    if (index === 0) return true
    const previous = coordinates[index - 1]
    return coordinate[0] !== previous[0] || coordinate[1] !== previous[1]
  })
}

function sliceRouteGeometry(
  line: readonly TransitGeoJsonPosition[],
  fromCandidates: readonly ProjectedPoint[],
  toCandidates: readonly ProjectedPoint[],
): { readonly geometry: JourneyLineString; readonly distanceMeters: number } | null {
  let selected: { readonly from: ProjectedPoint; readonly to: ProjectedPoint } | null = null
  let fromIndex = 0
  let closestForwardFrom: ProjectedPoint | null = null
  for (const to of toCandidates) {
    while (
      fromIndex < fromCandidates.length &&
      fromCandidates[fromIndex]!.distanceAlongLine + PROJECTION_EPSILON_METRES < to.distanceAlongLine
    ) {
      const from = fromCandidates[fromIndex++]!
      if (!closestForwardFrom || from.distanceToLine < closestForwardFrom.distanceToLine) {
        closestForwardFrom = from
      }
    }
    if (!closestForwardFrom) continue
    if (
      !selected ||
      closestForwardFrom.distanceToLine + to.distanceToLine <
        selected.from.distanceToLine + selected.to.distanceToLine
    ) selected = { from: closestForwardFrom, to }
  }
  if (!selected) return null

  const { from, to } = selected
  const coordinates = withoutDuplicateCoordinates([
    from.coordinate,
    ...line.slice(from.segmentIndex, to.segmentIndex),
    to.coordinate,
  ])
  if (coordinates.length < 2) return null

  return {
    geometry: { type: 'LineString', coordinates },
    distanceMeters: Math.round(to.distanceAlongLine - from.distanceAlongLine),
  }
}

function createShuttleLeg(
  ride: ShuttleRideDefinition,
  waitingSeconds: number,
  geometry: JourneyLineString,
  distanceMeters: number,
): ShuttleJourneyLeg {
  const from: TripEndpoint = { kind: 'stop', id: ride.fromStopId }
  const to: TripEndpoint = { kind: 'stop', id: ride.toStopId }
  return {
    mode: 'shuttle',
    from,
    to,
    durationSeconds: waitingSeconds + ride.rideSeconds,
    distanceMeters,
    geometry,
    routeId: ride.routeId,
    boardingStopId: ride.fromStopId,
    alightingStopId: ride.toStopId,
    waitingSeconds,
    rideSeconds: ride.rideSeconds,
  }
}

function createWalkingLeg(connection: WalkingJourneyConnection): WalkingJourneyLeg {
  return {
    mode: 'walking',
    from: connection.from,
    to: connection.to,
    durationSeconds: connection.durationSeconds,
    distanceMeters: connection.distanceMeters,
    geometry: connection.geometry,
  }
}

function isValidWalkingConnection(connection: WalkingJourneyConnection): boolean {
  return isFiniteNonNegativeInteger(connection.durationSeconds) &&
    isFiniteNonNegativeInteger(connection.distanceMeters) &&
    isValidLineString(connection.geometry)
}

function compareWalkingConnections(
  first: WalkingJourneyConnection,
  second: WalkingJourneyConnection,
): number {
  return first.durationSeconds - second.durationSeconds ||
    first.distanceMeters - second.distanceMeters ||
    compareText(getTripEndpointKey(first.from), getTripEndpointKey(second.from)) ||
    compareText(getTripEndpointKey(first.to), getTripEndpointKey(second.to))
}

function compareConnectors(first: WalkingConnector, second: WalkingConnector): number {
  const firstDuration = first.connection?.durationSeconds ?? 0
  const secondDuration = second.connection?.durationSeconds ?? 0
  const firstDistance = first.connection?.distanceMeters ?? 0
  const secondDistance = second.connection?.distanceMeters ?? 0
  return firstDuration - secondDuration ||
    firstDistance - secondDistance ||
    compareText(first.stopId, second.stopId)
}

function* collectConnectorsSteps(
  input: PlanJourneyInput,
  endpoint: JourneyEndpointLocation,
  isOrigin: boolean,
  shouldCheckpoint: () => boolean,
): Generator<void, readonly WalkingConnector[]> {
  if (endpoint.endpoint.kind === 'stop') {
    if (!input.transitIndex.stopById.has(endpoint.endpoint.id)) return []
    if (isOrigin) return [{ stopId: endpoint.endpoint.id, connection: null }]
  }

  const selectedByStop = new Map<string, WalkingConnector>()
  for (const connection of input.walkingConnections) {
    if (shouldCheckpoint()) yield
    if (!isValidWalkingConnection(connection)) continue
    const matchesEndpoint = isOrigin
      ? getTripEndpointKey(connection.from) === getTripEndpointKey(endpoint.endpoint) && connection.to.kind === 'stop'
      : endpoint.endpoint.kind === 'stop'
        ? connection.from.kind === 'stop' && connection.to.kind === 'stop' &&
          connection.from.id !== endpoint.endpoint.id && connection.to.id === endpoint.endpoint.id
        : connection.from.kind === 'stop' && getTripEndpointKey(connection.to) === getTripEndpointKey(endpoint.endpoint)
    if (!matchesEndpoint) continue

    const stopEndpoint = isOrigin ? connection.to : connection.from
    if (stopEndpoint.kind !== 'stop' || !input.transitIndex.stopById.has(stopEndpoint.id)) continue
    const candidate = { stopId: stopEndpoint.id, connection }
    const selected = selectedByStop.get(stopEndpoint.id)
    if (!selected || compareConnectors(candidate, selected) < 0) {
      selectedByStop.set(stopEndpoint.id, candidate)
    }
  }
  const topConnectors: WalkingConnector[] = []
  for (const candidate of selectedByStop.values()) {
    const insertAt = topConnectors.findIndex((connector) => compareConnectors(candidate, connector) < 0)
    if (insertAt < 0 && topConnectors.length >= MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS) {
      if (shouldCheckpoint()) yield
      continue
    }
    if (insertAt < 0) topConnectors.push(candidate)
    else topConnectors.splice(insertAt, 0, candidate)
    if (topConnectors.length > MAX_JOURNEY_ENDPOINT_STOP_CONNECTORS) topConnectors.pop()
    if (shouldCheckpoint()) yield
  }
  if (!isOrigin && endpoint.endpoint.kind === 'stop') {
    return [{ stopId: endpoint.endpoint.id, connection: null }, ...topConnectors]
  }
  return topConnectors
}

function getTimingKey(routeId: string, fromStopId: string, toStopId: string): string {
  return `${routeId}\u0000${fromStopId}\u0000${toStopId}`
}

function addWalkingConnection(
  byDestinationStop: Map<string, WalkingJourneyConnection>,
  connection: WalkingJourneyConnection,
): void {
  if (connection.from.kind !== 'stop' || connection.to.kind !== 'stop' || connection.from.id === connection.to.id) return
  const existing = byDestinationStop.get(connection.to.id)
  if (!existing || compareWalkingConnections(connection, existing) < 0) {
    byDestinationStop.set(connection.to.id, connection)
  }
}

const SEARCH_INDEX_CHECKPOINT_WORK = 64
const SEARCH_INDEX_YIELD_CHECKPOINTS = 8

function* buildSearchIndexSteps(
  input: PlanJourneyInput,
  now: () => number = () => performance.now(),
): Generator<void, JourneySearchIndex> {
  let workSinceCheckpoint = 0
  const shouldCheckpoint = () => {
    workSinceCheckpoint += 1
    if (workSinceCheckpoint < SEARCH_INDEX_CHECKPOINT_WORK) return false
    workSinceCheckpoint = 0
    return true
  }
  const originKey = getTripEndpointKey(input.origin.endpoint)
  const destinationKey = getTripEndpointKey(input.destination.endpoint)
  const directWalkingConnections: WalkingJourneyConnection[] = []
  const walkingByFromStop = new Map<string, Map<string, WalkingJourneyConnection>>()
  const timingByKey = new Map<string, ShuttleTimingRecord>()
  for (const record of input.shuttleTiming.records) {
    timingByKey.set(getTimingKey(record.routeId, record.fromStopId, record.toStopId), record)
    if (shouldCheckpoint()) yield
  }
  const geometryByRouteId = new Map<string, readonly TransitGeoJsonPosition[]>()
  for (const feature of input.routeGeometry.features) {
    geometryByRouteId.set(feature.properties.routeId, feature.geometry.coordinates)
    if (shouldCheckpoint()) yield
  }

  for (const connection of input.walkingConnections) {
    if (shouldCheckpoint()) yield
    if (!isValidWalkingConnection(connection)) continue
    if (
      getTripEndpointKey(connection.from) === originKey &&
      getTripEndpointKey(connection.to) === destinationKey
    ) directWalkingConnections.push(connection)

    if (connection.from.kind !== 'stop' || connection.to.kind !== 'stop') continue
    if (
      !input.transitIndex.stopById.has(connection.from.id) ||
      !input.transitIndex.stopById.has(connection.to.id) ||
      connection.from.id === connection.to.id
    ) continue
    const byDestination = walkingByFromStop.get(connection.from.id) ?? new Map<string, WalkingJourneyConnection>()
    addWalkingConnection(byDestination, connection)
    walkingByFromStop.set(connection.from.id, byDestination)
  }

  const ridesByBoardingStop = new Map<string, ShuttleRideDefinition[]>()
  for (const route of input.transitIndex.routes) {
    if (shouldCheckpoint()) yield
    const geometryLine = geometryByRouteId.get(route.id)
    if (!geometryLine || geometryLine.length < 2) continue
    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      const fromStopId = route.stopIds[fromIndex]
      const traversedStopIds = [fromStopId]
      const seenStopIds = new Set(traversedStopIds)
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        if (shouldCheckpoint()) yield
        const toStopId = route.stopIds[toIndex]
        if (seenStopIds.has(toStopId)) break
        seenStopIds.add(toStopId)
        traversedStopIds.push(toStopId)
        const record = timingByKey.get(getTimingKey(route.id, fromStopId, toStopId))
        if (
          !record ||
          record.status !== 'estimated' ||
          record.rideSeconds === null ||
          !isFiniteNonNegativeInteger(record.rideSeconds)
        ) continue
        if (!input.transitIndex.stopById.has(fromStopId) || !input.transitIndex.stopById.has(toStopId)) continue
        const ride: ShuttleRideDefinition = {
          routeId: route.id,
          fromStopId,
          toStopId,
          traversedStopIds: new Set(traversedStopIds),
          rideSeconds: record.rideSeconds,
          record,
          geometryLine,
        }
        const rides = ridesByBoardingStop.get(fromStopId) ?? []
        rides.push(ride)
        ridesByBoardingStop.set(fromStopId, rides)
      }
    }
  }

  const compareRides = (first: ShuttleRideDefinition, second: ShuttleRideDefinition) => (
    first.rideSeconds - second.rideSeconds ||
    compareText(first.routeId, second.routeId) ||
    compareText(first.toStopId, second.toStopId)
  )
  for (const rides of ridesByBoardingStop.values()) {
    rides.sort(compareRides)
    if (shouldCheckpoint()) yield
  }

  const destinationConnectors = yield* collectConnectorsSteps(
    input,
    input.destination,
    false,
    shouldCheckpoint,
  )
  const destinationConnectorByStopId = new Map<string, WalkingConnector>()
  for (const connector of destinationConnectors) {
    destinationConnectorByStopId.set(connector.stopId, connector)
    if (shouldCheckpoint()) yield
  }
  const transferOptionsByAlightingStopAndRoute = new Map<string, Map<string, TransferOption[]>>()
  for (const [alightingStopId, connections] of walkingByFromStop) {
    if (shouldCheckpoint()) yield
    const optionsByRoute = new Map<string, TransferOption[]>()
    for (const connection of connections.values()) {
      if (shouldCheckpoint()) yield
      if (connection.to.kind !== 'stop') continue
      const secondRides = ridesByBoardingStop.get(connection.to.id) ?? []
      for (const ride of secondRides) {
        if (shouldCheckpoint()) yield
        const destinationConnector = destinationConnectorByStopId.get(ride.toStopId)
        if (!destinationConnector) continue
        const options = optionsByRoute.get(ride.routeId) ?? []
        options.push({ connection, ride, destinationConnector })
        optionsByRoute.set(ride.routeId, options)
      }
    }
    if (optionsByRoute.size > 0) {
      transferOptionsByAlightingStopAndRoute.set(alightingStopId, optionsByRoute)
    }
  }

  const geometryByRideKey = new Map<string, ReturnType<typeof sliceRouteGeometry>>()
  const projectionsByRouteStopKey = new Map<string, readonly ProjectedPoint[]>()
  let geometrySliceCount = 0
  let geometrySliceDurationMs = 0
  const getStopProjections = (routeId: string, line: readonly TransitGeoJsonPosition[], stopId: string) => {
    const key = `${routeId}\u0000${stopId}`
    const cached = projectionsByRouteStopKey.get(key)
    if (cached) return cached
    const stop = input.transitIndex.stopById.get(stopId)
    if (!stop) return []
    const projections = projectPointOntoLine(toPosition(stop.longitude, stop.latitude), line)
    projectionsByRouteStopKey.set(key, projections)
    return projections
  }
  const getRideGeometry = (ride: ShuttleRideDefinition) => {
    const key = getTimingKey(ride.routeId, ride.fromStopId, ride.toStopId)
    if (geometryByRideKey.has(key)) return geometryByRideKey.get(key) ?? null
    const fromCandidates = getStopProjections(ride.routeId, ride.geometryLine, ride.fromStopId)
    const toCandidates = getStopProjections(ride.routeId, ride.geometryLine, ride.toStopId)
    const startedAt = now()
    const geometry = fromCandidates.length > 0 && toCandidates.length > 0
      ? sliceRouteGeometry(
        ride.geometryLine,
        fromCandidates,
        toCandidates,
      )
      : null
    geometrySliceCount += 1
    geometrySliceDurationMs += now() - startedAt
    geometryByRideKey.set(key, geometry)
    return geometry
  }

  return {
    originConnectors: yield* collectConnectorsSteps(input, input.origin, true, shouldCheckpoint),
    destinationConnectorByStopId,
    directWalkingConnections: directWalkingConnections.sort(compareWalkingConnections),
    ridesByBoardingStopId: ridesByBoardingStop,
    transferOptionsByAlightingStopAndRoute,
    getRideGeometry,
    getRideGeometryMetrics: () => ({
      buildCount: geometrySliceCount,
      buildDurationMs: geometrySliceDurationMs,
    }),
  }
}

function buildSearchIndex(input: PlanJourneyInput, now: () => number = () => performance.now()): JourneySearchIndex {
  const builder = buildSearchIndexSteps(input, now)
  let step = builder.next()
  while (!step.done) step = builder.next()
  return step.value
}

function hasRepeatedStops(
  firstRide: ShuttleRideDefinition,
  secondRide?: ShuttleRideDefinition,
  transferConnection?: WalkingJourneyConnection,
): boolean {
  const visited = firstRide.traversedStopIds
  if (transferConnection?.to.kind === 'stop' && visited.has(transferConnection.to.id)) return true
  if (secondRide) {
    for (const stopId of secondRide.traversedStopIds) {
      if (visited.has(stopId)) return true
    }
  }
  return false
}

interface CandidateSearchState {
  readonly collector: CandidateCollector
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
}

function* enumerateCandidateDefinitions(
  index: JourneySearchIndex,
): Generator<CandidateEnumerationStep> {
  for (const connection of index.directWalkingConnections) {
    yield { kind: 'work' }
    yield { kind: 'candidate', definition: { kind: 'walking', connection } }
  }

  for (const originConnector of index.originConnectors) {
    const firstRides = index.ridesByBoardingStopId.get(originConnector.stopId) ?? []
    for (const firstRide of firstRides) {
      yield { kind: 'work' }
      const destinationConnector = index.destinationConnectorByStopId.get(firstRide.toStopId)
      if (destinationConnector) {
        yield { kind: 'candidate', definition: {
          kind: 'shuttle',
          originConnector,
          rides: [firstRide],
          destinationConnector,
        } }
      }

      const optionsByRoute = index.transferOptionsByAlightingStopAndRoute.get(firstRide.toStopId)
      if (!optionsByRoute) continue
      let rejectedOptionCount = 0
      for (const [secondRouteId, options] of optionsByRoute) {
        if (firstRide.routeId === secondRouteId) continue
        for (const option of options) {
          if (hasRepeatedStops(firstRide, option.ride, option.connection)) {
            rejectedOptionCount += 1
            if (rejectedOptionCount % 64 === 0) yield { kind: 'work' }
            continue
          }
          yield { kind: 'candidate', definition: {
            kind: 'shuttle',
            originConnector,
            rides: [firstRide, option.ride],
            transferConnection: option.connection,
            destinationConnector: option.destinationConnector,
          } }
        }
      }
    }
  }
}

function shuttleCandidateKey(legs: readonly JourneyLeg[]): string {
  return 'bus:' + legs
    .filter((leg): leg is ShuttleJourneyLeg => leg.mode === 'shuttle')
    .map((leg) => `${leg.routeId}:${leg.boardingStopId}>${leg.alightingStopId}`)
    .join('|')
}

function candidateSequenceKey(legs: readonly JourneyLeg[]): string {
  return legs.map((leg) => leg.mode === 'shuttle'
    ? `shuttle:${leg.routeId}:${leg.boardingStopId}>${leg.alightingStopId}`
    : `walking:${getTripEndpointKey(leg.from)}>${getTripEndpointKey(leg.to)}`)
    .join('|')
}

function createCandidate(legs: readonly JourneyLeg[]): JourneyCandidate {
  const durationSeconds = legs.reduce((total, leg) => total + leg.durationSeconds, 0)
  const distanceMeters = legs.reduce((total, leg) => total + leg.distanceMeters, 0)
  const walkingDistanceMeters = legs.reduce(
    (total, leg) => total + (leg.mode === 'walking' ? leg.distanceMeters : 0),
    0,
  )
  let shuttleBoardings = 0
  let adjustedDurationSeconds = 0
  for (const leg of legs) {
    if (leg.mode === 'walking') {
      adjustedDurationSeconds += leg.durationSeconds / 0.8
    } else if (leg.mode === 'shuttle') {
      adjustedDurationSeconds += leg.durationSeconds / (shuttleBoardings > 0 ? 0.9 : 1)
      shuttleBoardings += 1
    }
  }
  const candidateKey = shuttleBoardings > 0
    ? shuttleCandidateKey(legs)
    : `walking:${candidateSequenceKey(legs)}`
  return {
    legs,
    durationSeconds,
    distanceMeters,
    walkingDistanceMeters,
    shuttleBoardings,
    adjustedDurationSeconds,
    score: adjustedDurationSeconds === 0 ? Number.POSITIVE_INFINITY : 1 / adjustedDurationSeconds,
    candidateKey,
    sequenceKey: candidateSequenceKey(legs),
  }
}

function compareCandidates(first: JourneyCandidate, second: JourneyCandidate): number {
  return first.adjustedDurationSeconds - second.adjustedDurationSeconds ||
    first.shuttleBoardings - second.shuttleBoardings ||
    first.walkingDistanceMeters - second.walkingDistanceMeters ||
    first.legs.length - second.legs.length ||
    compareText(first.sequenceKey, second.sequenceKey)
}

function resolveCandidate(
  input: PlanJourneyInput,
  index: JourneySearchIndex,
  definition: JourneyCandidateDefinition,
): JourneyCandidate | null {
  if (definition.kind === 'walking') {
    return createCandidate([createWalkingLeg(definition.connection)])
  }

  const destinationStopId = input.destination.endpoint.kind === 'stop'
    ? input.destination.endpoint.id
    : null
  if (
    destinationStopId !== null &&
    definition.destinationConnector.connection &&
    definition.rides.some((ride) => ride.traversedStopIds.has(destinationStopId))
  ) return null

  const legs: JourneyLeg[] = []
  let elapsedSeconds = 0
  if (definition.originConnector.connection) {
    const walkingLeg = createWalkingLeg(definition.originConnector.connection)
    legs.push(walkingLeg)
    elapsedSeconds += walkingLeg.durationSeconds
  }

  for (const [rideIndex, ride] of definition.rides.entries()) {
    const waitingSeconds = input.getShuttleWaitingSeconds(ride.record, {
      routeId: ride.routeId,
      boardingStopId: ride.fromStopId,
      elapsedSeconds,
    })
    const routeGeometry = index.getRideGeometry(ride)
    if (
      waitingSeconds === null ||
      !isFiniteNonNegativeInteger(waitingSeconds) ||
      !isFiniteNonNegativeInteger(ride.rideSeconds) ||
      !routeGeometry ||
      !isValidLineString(routeGeometry.geometry)
    ) return null

    const shuttleLeg = createShuttleLeg(
      ride,
      waitingSeconds,
      routeGeometry.geometry,
      routeGeometry.distanceMeters,
    )
    legs.push(shuttleLeg)
    elapsedSeconds += shuttleLeg.durationSeconds

    if (rideIndex === 0 && definition.transferConnection) {
      if (!isValidWalkingConnection(definition.transferConnection)) return null
      const transferLeg = createWalkingLeg(definition.transferConnection)
      legs.push(transferLeg)
      elapsedSeconds += transferLeg.durationSeconds
    }
  }

  if (definition.destinationConnector.connection) {
    legs.push(createWalkingLeg(definition.destinationConnector.connection))
  }
  return createCandidate(legs)
}

function addCandidate(collector: CandidateCollector, candidate: JourneyCandidate | null): void {
  if (!candidate) return
  if (candidate.shuttleBoardings === 0) {
    const current = collector.walkingByKey.get(candidate.candidateKey)
    if (!current || compareCandidates(candidate, current) < 0) {
      collector.walkingByKey.set(candidate.candidateKey, candidate)
    }
    return
  }

  const current = collector.busByKey.get(candidate.candidateKey)
  if (!current || compareCandidates(candidate, current) < 0) {
    collector.busByKey.set(candidate.candidateKey, candidate)
  }
}

function toJourney(
  input: PlanJourneyInput,
  candidate: JourneyCandidate,
  planningQuality: JourneyPlanningQuality,
): Journey {
  return {
    origin: input.origin.endpoint,
    destination: input.destination.endpoint,
    legs: candidate.legs,
    totalDurationSeconds: candidate.durationSeconds,
    totalDistanceMeters: candidate.distanceMeters,
    estimateStatus: 'estimated',
    planningQuality,
  }
}

function collectJourneyCandidates(
  input: PlanJourneyInput,
  collector: CandidateCollector,
  planningQuality: JourneyPlanningQuality,
): readonly ScoredJourneyCandidate[] {
  const topBusCandidates = [...collector.busByKey.values()]
    .sort(compareCandidates)
    .slice(0, MAX_BUS_JOURNEY_CANDIDATES)
  const walkingCandidate = [...collector.walkingByKey.values()]
    .sort(compareCandidates)[0]
  const candidates = [
    ...topBusCandidates,
    ...(walkingCandidate ? [walkingCandidate] : []),
  ].sort(compareCandidates)
  return toScoredJourneyCandidates(input, candidates, planningQuality)
}

function collectRankedJourneyCandidates(
  input: PlanJourneyInput,
  collector: CandidateCollector,
  planningQuality: JourneyPlanningQuality,
): readonly ScoredJourneyCandidate[] {
  const candidates = [
    ...collector.busByKey.values(),
    ...collector.walkingByKey.values(),
  ].sort(compareCandidates)
  return toScoredJourneyCandidates(input, candidates, planningQuality)
}

function toScoredJourneyCandidates(
  input: PlanJourneyInput,
  candidates: readonly JourneyCandidate[],
  planningQuality: JourneyPlanningQuality,
): readonly ScoredJourneyCandidate[] {
  return candidates.map((candidate) => ({
    candidateKey: candidate.candidateKey,
    journey: toJourney(input, candidate, planningQuality),
    adjustedDurationSeconds: candidate.adjustedDurationSeconds,
    score: candidate.score,
  }))
}

function createCollector(): CandidateCollector {
  return { busByKey: new Map(), walkingByKey: new Map() }
}

function createPlanningResult(
  input: PlanJourneyInput,
  collector: CandidateCollector,
  status: JourneyPlanningStatus,
  expandedPathCount: number,
  indexBuildDurationMs: number,
  candidateResolutionDurationMs: number,
  candidateEnumerationStepCount: number,
  searchDurationMs: number,
  searchYieldWaitMs: number,
  searchCpuMs: number,
  maxSearchChunkDurationMs: number,
  geometrySliceCount: number,
  geometrySliceDurationMs: number,
): JourneyPlanningResult {
  const planningQuality = status === 'complete' ? 'exact' : 'bounded'
  const candidates = collectJourneyCandidates(input, collector, planningQuality)
  return {
    journey: candidates[0]?.journey ?? null,
    candidates,
    status,
    expandedPathCount,
    indexBuildDurationMs,
    candidateResolutionDurationMs,
    candidateEnumerationStepCount,
    searchDurationMs,
    searchYieldWaitMs,
    searchCpuMs,
    maxSearchChunkDurationMs,
    geometrySliceCount,
    geometrySliceDurationMs,
  }
}

export function planJourney(input: PlanJourneyInput): Journey | null {
  const index = buildSearchIndex(input)
  const collector = createCollector()
  for (const step of enumerateCandidateDefinitions(index)) {
    if (step.kind === 'candidate') {
      addCandidate(collector, resolveCandidate(input, index, step.definition))
    }
  }
  return createPlanningResult(input, collector, 'complete', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0).journey
}

export async function planJourneyWithinBudget(
  input: PlanJourneyInput,
  options: JourneyPlanningOptions = {},
): Promise<JourneyPlanningResult> {
  const search = await runBoundedCandidateSearch(input, options)
  const planningQuality = search.status === 'complete' ? 'exact' : 'bounded'
  const candidates = collectJourneyCandidates(input, search.collector, planningQuality)
  return {
    journey: candidates[0]?.journey ?? null,
    candidates,
    status: search.status,
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
  }
}

export async function searchJourneyCandidatesWithinBudget(
  input: PlanJourneyInput,
  options: JourneyPlanningOptions = {},
): Promise<JourneyCandidateSearchResult> {
  const search = await runBoundedCandidateSearch(input, options)
  return createSearchResult(input, search)
}

async function runBoundedCandidateSearch(
  input: PlanJourneyInput,
  options: JourneyPlanningOptions,
): Promise<CandidateSearchState> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const collector = createCollector()
  const yieldEvery = options.yieldEvery ?? (options.yieldControl ? 64 : 0)
  let expandedPathCount = 0
  let indexBuildDurationMs = 0
  let enumerationStepCount = 0
  let candidateResolutionDurationMs = 0
  let searchYieldWaitMs = 0
  let maxSearchChunkDurationMs = 0
  let searchChunkStartedAt = startedAt
  let getGeometryMetrics = () => ({ buildCount: 0, buildDurationMs: 0 })

  const createState = (status: JourneyPlanningStatus): CandidateSearchState => {
    const geometryMetrics = getGeometryMetrics()
    const endedAt = now()
    const searchDurationMs = Math.max(0, endedAt - startedAt)
    return {
      collector,
      status,
      expandedPathCount,
      indexBuildDurationMs,
      candidateResolutionDurationMs,
      candidateEnumerationStepCount: enumerationStepCount,
      searchDurationMs,
      searchYieldWaitMs,
      searchCpuMs: Math.max(0, searchDurationMs - searchYieldWaitMs),
      maxSearchChunkDurationMs: Math.max(
        maxSearchChunkDurationMs,
        Math.max(0, endedAt - searchChunkStartedAt),
      ),
      geometrySliceCount: geometryMetrics.buildCount,
      geometrySliceDurationMs: geometryMetrics.buildDurationMs,
    }
  }

  if (options.shouldCancel?.()) {
    return createState('cancelled')
  }

  const indexBuildStartedAt = now()
  const exceededDuration = () => (
    (options.maxDurationMs !== undefined && now() - startedAt >= options.maxDurationMs) ||
    (options.deadlineAtMs !== undefined && now() >= options.deadlineAtMs)
  )
  const indexBuilder = buildSearchIndexSteps(input, now)
  let indexStep = indexBuilder.next()
  let indexCheckpointCount = 0
  const indexYieldEvery = Math.min(yieldEvery, SEARCH_INDEX_YIELD_CHECKPOINTS)
  while (!indexStep.done) {
    indexCheckpointCount += 1
    indexBuildDurationMs = Math.max(0, now() - indexBuildStartedAt)
    if (options.shouldCancel?.()) return createState('cancelled')
    if (exceededDuration()) return createState('budget-exceeded')

    if (
      yieldEvery > 0 &&
      options.yieldControl &&
      indexCheckpointCount % indexYieldEvery === 0 &&
      !options.shouldCancel?.()
    ) {
      const yieldStartedAt = now()
      maxSearchChunkDurationMs = Math.max(
        maxSearchChunkDurationMs,
        Math.max(0, yieldStartedAt - searchChunkStartedAt),
      )
      await options.yieldControl()
      searchYieldWaitMs += Math.max(0, now() - yieldStartedAt)
      searchChunkStartedAt = now()
      indexBuildDurationMs = Math.max(0, now() - indexBuildStartedAt)
      if (options.shouldCancel?.()) return createState('cancelled')
      if (exceededDuration()) return createState('budget-exceeded')
    }

    indexStep = indexBuilder.next()
  }
  const index = indexStep.value
  getGeometryMetrics = index.getRideGeometryMetrics
  indexBuildDurationMs = Math.max(0, now() - indexBuildStartedAt)
  if (options.shouldCancel?.()) return createState('cancelled')
  if (exceededDuration()) {
    return createState('budget-exceeded')
  }

  for (const step of enumerateCandidateDefinitions(index)) {
    if (options.shouldCancel?.()) {
      return createState('cancelled')
    }
    if (
      exceededDuration() ||
      (options.maxExpandedPaths !== undefined && expandedPathCount >= options.maxExpandedPaths)
    ) {
      return createState('budget-exceeded')
    }

    enumerationStepCount += 1
    if (step.kind === 'candidate') {
      const resolutionStartedAt = now()
      addCandidate(collector, resolveCandidate(input, index, step.definition))
      candidateResolutionDurationMs += now() - resolutionStartedAt
      expandedPathCount += 1
    }

    if (yieldEvery > 0 && enumerationStepCount % yieldEvery === 0 && !options.shouldCancel?.()) {
      const yieldStartedAt = now()
      maxSearchChunkDurationMs = Math.max(
        maxSearchChunkDurationMs,
        Math.max(0, yieldStartedAt - searchChunkStartedAt),
      )
      await options.yieldControl?.()
      searchYieldWaitMs += Math.max(0, now() - yieldStartedAt)
      searchChunkStartedAt = now()
    }
  }

  return createState('complete')
}

function createSearchResult(
  input: PlanJourneyInput,
  search: CandidateSearchState,
): JourneyCandidateSearchResult {
  return {
    rankedCandidates: collectRankedJourneyCandidates(
      input,
      search.collector,
      search.status === 'complete' ? 'exact' : 'bounded',
    ),
    status: search.status,
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
  }
}

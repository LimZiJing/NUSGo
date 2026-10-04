import type { TransitIndex } from '../transit'
import type {
  ShuttleTimingData,
  ShuttleTimingRecord,
} from '../transit/timing'
import type {
  TransitGeoJsonPosition,
  TransitRouteGeometry,
} from '../transit/types'
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
  readonly maxExpandedPaths?: number
  readonly shouldCancel?: () => boolean
  readonly yieldEvery?: number
  readonly yieldControl?: () => Promise<void>
  readonly now?: () => number
}

export type JourneyPlanningStatus = 'complete' | 'budget-exceeded' | 'cancelled'

export interface JourneyPlanningResult {
  readonly journey: Journey | null
  readonly status: JourneyPlanningStatus
  readonly expandedPathCount: number
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

const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320
const PROJECTION_EPSILON_METRES = 0.001
const MAX_ENDPOINT_STOP_CONNECTORS = 3

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function isFiniteNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0
}

function isValidLineString(geometry: JourneyLineString): boolean {
  return geometry.type === 'LineString' && geometry.coordinates.length >= 2
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
    const distanceToLine = distanceBetween(point, projected)
    const candidate: ProjectedPoint = {
      segmentIndex: index,
      distanceAlongLine: distanceAlongLine + segmentLength * ratio,
      distanceToLine,
      coordinate: projected,
    }
    candidates.push(candidate)
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
  fromStop: TransitGeoJsonPosition,
  toStop: TransitGeoJsonPosition,
): { readonly geometry: JourneyLineString; readonly distanceMeters: number } | null {
  const fromCandidates = projectPointOntoLine(fromStop, line)
  const toCandidates = projectPointOntoLine(toStop, line)
  let selected: { readonly from: ProjectedPoint; readonly to: ProjectedPoint } | null = null
  for (const from of fromCandidates) {
    for (const to of toCandidates) {
      if (to.distanceAlongLine <= from.distanceAlongLine + PROJECTION_EPSILON_METRES) continue
      const candidate = { from, to }
      if (
        !selected ||
        from.distanceToLine + to.distanceToLine <
          selected.from.distanceToLine + selected.to.distanceToLine
      ) {
        selected = candidate
      }
    }
  }
  if (!selected) {
    return null
  }
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
  routeId: string,
  fromStopId: string,
  toStopId: string,
  waitingSeconds: number,
  rideSeconds: number,
  geometry: JourneyLineString,
  distanceMeters: number,
): ShuttleJourneyLeg {
  const from: TripEndpoint = { kind: 'stop', id: fromStopId }
  const to: TripEndpoint = { kind: 'stop', id: toStopId }
  return {
    mode: 'shuttle',
    from,
    to,
    durationSeconds: waitingSeconds + rideSeconds,
    distanceMeters,
    geometry,
    routeId,
    boardingStopId: fromStopId,
    alightingStopId: toStopId,
    waitingSeconds,
    rideSeconds,
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

interface WalkingConnector {
  readonly stopId: string
  readonly connection: WalkingJourneyConnection | null
}

interface WalkingCandidateDefinition {
  readonly kind: 'walking'
  readonly connection: WalkingJourneyConnection
}

interface ShuttleCandidateDefinition {
  readonly kind: 'shuttle'
  readonly originConnector: WalkingConnector
  readonly destinationConnector: WalkingConnector
  readonly routeId: string
  readonly fromStopId: string
  readonly toStopId: string
  readonly rideSeconds: number
  readonly record: ShuttleTimingRecord
  readonly geometry: JourneyLineString
  readonly distanceMeters: number
}

type JourneyCandidateDefinition = WalkingCandidateDefinition | ShuttleCandidateDefinition

interface JourneyCandidate {
  readonly legs: readonly JourneyLeg[]
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly sequenceKey: string
}

function compareCandidates(first: JourneyCandidate, second: JourneyCandidate): number {
  for (const [firstValue, secondValue] of [
    [first.durationSeconds, second.durationSeconds],
    [first.shuttleBoardings, second.shuttleBoardings],
    [first.walkingDistanceMeters, second.walkingDistanceMeters],
    [first.legs.length, second.legs.length],
  ] as const) {
    if (firstValue !== secondValue) return firstValue - secondValue
  }
  return compareText(first.sequenceKey, second.sequenceKey)
}

function isValidWalkingConnection(connection: WalkingJourneyConnection): boolean {
  return isFiniteNonNegativeInteger(connection.durationSeconds) &&
    isFiniteNonNegativeInteger(connection.distanceMeters) &&
    isValidLineString(connection.geometry)
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

function collectConnectors(
  input: PlanJourneyInput,
  endpoint: JourneyEndpointLocation,
  isOrigin: boolean,
): readonly WalkingConnector[] {
  if (endpoint.endpoint.kind === 'stop') {
    return input.transitIndex.stopById.has(endpoint.endpoint.id)
      ? [{ stopId: endpoint.endpoint.id, connection: null }]
      : []
  }

  const selectedByStop = new Map<string, WalkingConnector>()
  for (const connection of input.walkingConnections) {
    if (!isValidWalkingConnection(connection)) continue
    const matchesEndpoint = isOrigin
      ? getTripEndpointKey(connection.from) === getTripEndpointKey(endpoint.endpoint) && connection.to.kind === 'stop'
      : connection.from.kind === 'stop' && getTripEndpointKey(connection.to) === getTripEndpointKey(endpoint.endpoint)
    if (!matchesEndpoint) continue

    const stopEndpoint = isOrigin ? connection.to : connection.from
    if (stopEndpoint.kind !== 'stop') continue
    const stopId = stopEndpoint.id
    if (!input.transitIndex.stopById.has(stopId)) continue
    const candidate = { stopId, connection }
    const selected = selectedByStop.get(stopId)
    if (!selected || compareConnectors(candidate, selected) < 0) {
      selectedByStop.set(stopId, candidate)
    }
  }
  return [...selectedByStop.values()].sort(compareConnectors).slice(0, MAX_ENDPOINT_STOP_CONNECTORS)
}

function buildCandidateDefinitions(input: PlanJourneyInput): readonly JourneyCandidateDefinition[] {
  const definitions: JourneyCandidateDefinition[] = []
  for (const connection of input.walkingConnections) {
    if (
      getTripEndpointKey(connection.from) === getTripEndpointKey(input.origin.endpoint) &&
      getTripEndpointKey(connection.to) === getTripEndpointKey(input.destination.endpoint) &&
      isValidWalkingConnection(connection)
    ) definitions.push({ kind: 'walking', connection })
  }

  const originConnectors = collectConnectors(input, input.origin, true)
  const destinationConnectors = collectConnectors(input, input.destination, false)
  const timingByKey = new Map(
    input.shuttleTiming.records.map((record) => [
      record.routeId + ':' + record.fromStopId + '->' + record.toStopId,
      record,
    ]),
  )
  const geometryByRouteId = new Map(
    input.routeGeometry.features.map((feature) => [feature.properties.routeId, feature.geometry.coordinates]),
  )

  for (const route of input.transitIndex.routes) {
    const line = geometryByRouteId.get(route.id)
    if (!line) continue

    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      const fromStopId = route.stopIds[fromIndex]
      const originOptions = originConnectors.filter((connector) => connector.stopId === fromStopId)
      if (originOptions.length === 0) continue

      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        const toStopId = route.stopIds[toIndex]
        if (fromStopId === toStopId) continue
        const destinationOptions = destinationConnectors.filter((connector) => connector.stopId === toStopId)
        if (destinationOptions.length === 0) continue
        const record = timingByKey.get(route.id + ':' + fromStopId + '->' + toStopId)
        if (
          !record ||
          record.status !== 'estimated' ||
          record.rideSeconds === null ||
          !isFiniteNonNegativeInteger(record.rideSeconds)
        ) continue

        const fromStop = input.transitIndex.stopById.get(fromStopId)
        const toStop = input.transitIndex.stopById.get(toStopId)
        if (!fromStop || !toStop) continue
        const sliced = sliceRouteGeometry(
          line,
          toPosition(fromStop.longitude, fromStop.latitude),
          toPosition(toStop.longitude, toStop.latitude),
        )
        if (!sliced) continue

        for (const originConnector of originOptions) {
          for (const destinationConnector of destinationOptions) {
            definitions.push({
              kind: 'shuttle',
              originConnector,
              destinationConnector,
              routeId: route.id,
              fromStopId,
              toStopId,
              rideSeconds: record.rideSeconds,
              record,
              geometry: sliced.geometry,
              distanceMeters: sliced.distanceMeters,
            })
          }
        }
      }
    }
  }

  return definitions
}

function createCandidate(legs: readonly JourneyLeg[], sequenceKey: string): JourneyCandidate {
  return {
    legs,
    durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
    walkingDistanceMeters: legs.reduce(
      (total, leg) => total + (leg.mode === 'walking' ? leg.distanceMeters : 0),
      0,
    ),
    shuttleBoardings: legs.filter((leg) => leg.mode === 'shuttle').length,
    sequenceKey,
  }
}

function walkingSequenceKey(connection: WalkingJourneyConnection): string {
  return 'walking:' + getTripEndpointKey(connection.from) + '>' + getTripEndpointKey(connection.to)
}

function resolveCandidate(
  definition: JourneyCandidateDefinition,
  getShuttleWaitingSeconds: ShuttleWaitingTimeProvider,
): JourneyCandidate | null {
  if (definition.kind === 'walking') {
    return createCandidate(
      [createWalkingLeg(definition.connection)],
      walkingSequenceKey(definition.connection),
    )
  }

  const elapsedSeconds = definition.originConnector.connection?.durationSeconds ?? 0
  const waitingSeconds = getShuttleWaitingSeconds(definition.record, {
    routeId: definition.routeId,
    boardingStopId: definition.fromStopId,
    elapsedSeconds,
  })
  if (
    waitingSeconds === null ||
    !isFiniteNonNegativeInteger(waitingSeconds) ||
    !isFiniteNonNegativeInteger(definition.rideSeconds)
  ) return null

  const legs: JourneyLeg[] = []
  if (definition.originConnector.connection) {
    legs.push(createWalkingLeg(definition.originConnector.connection))
  }
  legs.push(createShuttleLeg(
    definition.routeId,
    definition.fromStopId,
    definition.toStopId,
    waitingSeconds,
    definition.rideSeconds,
    definition.geometry,
    definition.distanceMeters,
  ))
  if (definition.destinationConnector.connection) {
    legs.push(createWalkingLeg(definition.destinationConnector.connection))
  }

  const sequenceKey = [
    definition.originConnector.connection
      ? walkingSequenceKey(definition.originConnector.connection)
      : '',
    'shuttle:' + definition.routeId + ':' + definition.fromStopId + '>' + definition.toStopId,
    definition.destinationConnector.connection
      ? walkingSequenceKey(definition.destinationConnector.connection)
      : '',
  ].filter(Boolean).join('|')
  return createCandidate(legs, sequenceKey)
}

function createJourney(
  input: PlanJourneyInput,
  candidate: JourneyCandidate | null,
  planningQuality: JourneyPlanningQuality,
): Journey | null {
  if (!candidate) return null
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

function findBestCandidate(
  input: PlanJourneyInput,
  definitions: readonly JourneyCandidateDefinition[],
): JourneyCandidate | null {
  let best: JourneyCandidate | null = null
  for (const definition of definitions) {
    const candidate = resolveCandidate(definition, input.getShuttleWaitingSeconds)
    if (candidate && (!best || compareCandidates(candidate, best) < 0)) best = candidate
  }
  return best
}

export function planJourney(input: PlanJourneyInput): Journey | null {
  const definitions = buildCandidateDefinitions(input)
  return createJourney(input, findBestCandidate(input, definitions), 'exact')
}

export async function planJourneyWithinBudget(
  input: PlanJourneyInput,
  options: JourneyPlanningOptions = {},
): Promise<JourneyPlanningResult> {
  const definitions = buildCandidateDefinitions(input)
  const now = options.now ?? Date.now
  const startedAt = now()
  const yieldEvery = options.yieldEvery ?? (options.yieldControl ? 64 : 0)
  let bestCandidate: JourneyCandidate | null = null
  let expandedPathCount = 0

  const createResult = (status: JourneyPlanningStatus): JourneyPlanningResult => ({
    journey: createJourney(
      input,
      bestCandidate,
      status === 'complete' ? 'exact' : 'bounded',
    ),
    status,
    expandedPathCount,
  })

  for (const definition of definitions) {
    if (options.shouldCancel?.()) return createResult('cancelled')
    if (
      (options.maxDurationMs !== undefined && now() - startedAt >= options.maxDurationMs) ||
      (options.maxExpandedPaths !== undefined && expandedPathCount >= options.maxExpandedPaths)
    ) return createResult('budget-exceeded')

    const candidate = resolveCandidate(definition, input.getShuttleWaitingSeconds)
    expandedPathCount += 1
    if (candidate && (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0)) {
      bestCandidate = candidate
    }

    if (!options.shouldCancel?.() && yieldEvery > 0 && expandedPathCount % yieldEvery === 0) {
      await options.yieldControl?.()
    }
  }

  return createResult('complete')
}

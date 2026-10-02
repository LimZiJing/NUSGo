import type { TransitIndex } from '../transit'
import type {
  ShuttleTimingData,
  ShuttleTimingRecord,
} from '../transit/timing'
import type { TransitGeoJsonPosition, TransitRouteGeometry } from '../transit/types'
import type { TripEndpoint } from './types'
import type {
  Journey,
  JourneyEndpointLocation,
  JourneyLineString,
  JourneyLeg,
  ShuttleJourneyLeg,
  WalkingJourneyLeg,
} from './journey'

const MAX_ENDPOINT_STOP_CANDIDATES = 5
const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320
const PROJECTION_EPSILON_METRES = 0.001

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

export interface PlanJourneyInput {
  readonly origin: JourneyEndpointLocation
  readonly destination: JourneyEndpointLocation
  readonly transitIndex: TransitIndex
  readonly routeGeometry: TransitRouteGeometry
  readonly shuttleTiming: ShuttleTimingData
  readonly walkingConnections: readonly WalkingJourneyConnection[]
  readonly getShuttleWaitingSeconds: ShuttleWaitingTimeProvider
}

interface StopAccess {
  readonly stopId: string
  readonly walking: WalkingJourneyConnection | null
  readonly walkingDistanceMeters: number
}

interface ShuttleSegment {
  readonly routeId: string
  readonly fromStopId: string
  readonly toStopId: string
  readonly rideSeconds: number
  readonly record: ShuttleTimingRecord
  readonly geometry: JourneyLineString
  readonly distanceMeters: number
  readonly reachesRouteTerminal: boolean
  readonly sequenceKey: string
}

interface JourneyCandidate {
  readonly journey: Journey
  readonly shuttleBoardings: number
  readonly walkingDistanceMeters: number
  readonly sequenceKey: string
}

interface PlannerContext {
  readonly originAccesses: readonly StopAccess[]
  readonly destinationAccesses: readonly StopAccess[]
  readonly transferWalking: ReadonlyMap<string, ReadonlyMap<string, WalkingJourneyConnection>>
  readonly segmentsByFromStop: ReadonlyMap<string, readonly ShuttleSegment[]>
  readonly segmentsByToStop: ReadonlyMap<string, readonly ShuttleSegment[]>
  readonly segmentsByStopPair: ReadonlyMap<string, readonly ShuttleSegment[]>
}

interface ProjectedPoint {
  readonly segmentIndex: number
  readonly distanceAlongLine: number
  readonly distanceToLine: number
  readonly coordinate: TransitGeoJsonPosition
}

function endpointKey(endpoint: TripEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function compareNumbers(first: number, second: number): number {
  return first - second
}

function isFiniteNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0
}

function isValidLineString(geometry: JourneyLineString | null | undefined): boolean {
  return geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 && geometry.coordinates.every(
    (coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]),
  )
}

function isValidWalkingConnection(connection: WalkingJourneyConnection): boolean {
  return isFiniteNonNegativeInteger(connection.durationSeconds) &&
    isFiniteNonNegativeInteger(connection.distanceMeters) &&
    isValidLineString(connection.geometry)
}

function walkingSequenceKey(connection: WalkingJourneyConnection): string {
  return `walking:${endpointKey(connection.from)}>${endpointKey(connection.to)}`
}

function stopPairKey(fromStopId: string, toStopId: string): string {
  return `${fromStopId}\u0000${toStopId}`
}

function addToMapSet<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? []
  values.push(value)
  map.set(key, values)
}

function distanceBetween(
  first: TransitGeoJsonPosition,
  second: TransitGeoJsonPosition,
): number {
  const firstLatitude = first[1] * Math.PI / 180
  const secondLatitude = second[1] * Math.PI / 180
  const latitudeDelta = (second[1] - first[1]) * Math.PI / 180
  const longitudeDelta = (second[0] - first[0]) * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)))
}

function projectPointOntoLine(
  point: TransitGeoJsonPosition,
  line: readonly TransitGeoJsonPosition[],
): ProjectedPoint[] {
  const candidates: ProjectedPoint[] = []
  let distanceAlongLine = 0

  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index]
    const end = line[index + 1]
    if (!start || !end) continue

    const startMeters: TransitGeoJsonPosition = [
      start[0] * METRES_PER_LONGITUDE_DEGREE * Math.cos(start[1] * Math.PI / 180),
      start[1] * METRES_PER_LATITUDE_DEGREE,
    ]
    const endMeters: TransitGeoJsonPosition = [
      end[0] * METRES_PER_LONGITUDE_DEGREE * Math.cos(end[1] * Math.PI / 180),
      end[1] * METRES_PER_LATITUDE_DEGREE,
    ]
    const pointMeters: TransitGeoJsonPosition = [
      point[0] * METRES_PER_LONGITUDE_DEGREE * Math.cos(point[1] * Math.PI / 180),
      point[1] * METRES_PER_LATITUDE_DEGREE,
    ]
    const deltaX = endMeters[0] - startMeters[0]
    const deltaY = endMeters[1] - startMeters[1]
    const lengthSquared = deltaX ** 2 + deltaY ** 2
    const segmentLength = Math.sqrt(lengthSquared)
    if (segmentLength === 0) continue

    const ratio = Math.max(
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
      ) selected = candidate
    }
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
  segment: ShuttleSegment,
  waitingSeconds: number,
): ShuttleJourneyLeg {
  return {
    mode: 'shuttle',
    from: { kind: 'stop', id: segment.fromStopId },
    to: { kind: 'stop', id: segment.toStopId },
    durationSeconds: waitingSeconds + segment.rideSeconds,
    distanceMeters: segment.distanceMeters,
    geometry: segment.geometry,
    routeId: segment.routeId,
    boardingStopId: segment.fromStopId,
    alightingStopId: segment.toStopId,
    waitingSeconds,
    rideSeconds: segment.rideSeconds,
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

function withoutDuplicateJourneyCoordinates(
  coordinates: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  return coordinates.filter((coordinate, index) => {
    if (index === 0) return true
    const previous = coordinates[index - 1]
    return coordinate[0] !== previous[0] || coordinate[1] !== previous[1]
  })
}

function mergeConsecutiveWalkingLegs(
  legs: readonly JourneyLeg[],
): readonly JourneyLeg[] {
  const normalized: JourneyLeg[] = []

  for (const leg of legs) {
    const previous = normalized.at(-1)
    if (previous?.mode === 'walking' && leg.mode === 'walking') {
      normalized[normalized.length - 1] = {
        mode: 'walking',
        from: previous.from,
        to: leg.to,
        durationSeconds: previous.durationSeconds + leg.durationSeconds,
        distanceMeters: previous.distanceMeters + leg.distanceMeters,
        geometry: {
          type: 'LineString',
          coordinates: withoutDuplicateJourneyCoordinates([
            ...previous.geometry.coordinates,
            ...leg.geometry.coordinates,
          ]),
        },
      }
      continue
    }
    normalized.push(leg)
  }

  return normalized
}

function selectShortestWalkingConnection(
  current: WalkingJourneyConnection | undefined,
  candidate: WalkingJourneyConnection,
): WalkingJourneyConnection {
  if (!current) return candidate
  return candidate.distanceMeters < current.distanceMeters || (
    candidate.distanceMeters === current.distanceMeters &&
    candidate.durationSeconds < current.durationSeconds
  ) ? candidate : current
}

function selectNearestStopAccesses(accesses: readonly StopAccess[]): readonly StopAccess[] {
  const shortestByStop = new Map<string, StopAccess>()
  for (const access of accesses) {
    const current = shortestByStop.get(access.stopId)
    if (
      !current ||
      access.walkingDistanceMeters < current.walkingDistanceMeters ||
      (
        access.walkingDistanceMeters === current.walkingDistanceMeters &&
        access.walking?.durationSeconds !== undefined &&
        access.walking.durationSeconds < (current.walking?.durationSeconds ?? Number.MAX_SAFE_INTEGER)
      )
    ) shortestByStop.set(access.stopId, access)
  }

  return [...shortestByStop.values()]
    .sort((first, second) => (
      compareNumbers(first.walkingDistanceMeters, second.walkingDistanceMeters) ||
      compareText(first.stopId, second.stopId)
    ))
    .slice(0, MAX_ENDPOINT_STOP_CANDIDATES)
}

function createStopAccesses(
  input: PlanJourneyInput,
  walkingConnections: readonly WalkingJourneyConnection[],
): { readonly origin: readonly StopAccess[]; readonly destination: readonly StopAccess[] } {
  const originAccesses: StopAccess[] = []
  const destinationAccesses: StopAccess[] = []

  if (input.origin.endpoint.kind === 'stop') {
    originAccesses.push({
      stopId: input.origin.endpoint.id,
      walking: null,
      walkingDistanceMeters: 0,
    })
  }
  if (input.destination.endpoint.kind === 'stop') {
    destinationAccesses.push({
      stopId: input.destination.endpoint.id,
      walking: null,
      walkingDistanceMeters: 0,
    })
  }

  for (const connection of walkingConnections) {
    if (connection.from.kind === input.origin.endpoint.kind &&
      connection.from.id === input.origin.endpoint.id &&
      connection.to.kind === 'stop') {
      originAccesses.push({
        stopId: connection.to.id,
        walking: connection,
        walkingDistanceMeters: connection.distanceMeters,
      })
    }
    if (connection.to.kind === input.destination.endpoint.kind &&
      connection.to.id === input.destination.endpoint.id &&
      connection.from.kind === 'stop') {
      destinationAccesses.push({
        stopId: connection.from.id,
        walking: connection,
        walkingDistanceMeters: connection.distanceMeters,
      })
    }
  }

  return {
    origin: selectNearestStopAccesses(originAccesses),
    destination: selectNearestStopAccesses(destinationAccesses),
  }
}

function createTransferWalking(
  walkingConnections: readonly WalkingJourneyConnection[],
): ReadonlyMap<string, ReadonlyMap<string, WalkingJourneyConnection>> {
  const connections = new Map<string, Map<string, WalkingJourneyConnection>>()
  for (const connection of walkingConnections) {
    if (connection.from.kind !== 'stop' || connection.to.kind !== 'stop') continue
    const toConnections = connections.get(connection.from.id) ?? new Map()
    toConnections.set(
      connection.to.id,
      selectShortestWalkingConnection(toConnections.get(connection.to.id), connection),
    )
    connections.set(connection.from.id, toConnections)
  }
  return connections
}

function buildShuttleSegments(input: PlanJourneyInput): readonly ShuttleSegment[] {
  const timingByKey = new Map(
    input.shuttleTiming.records.map((record) => [
      `${record.routeId}:${record.fromStopId}->${record.toStopId}`,
      record,
    ]),
  )
  const geometryByRouteId = new Map(
    input.routeGeometry.features.map((feature) => [feature.properties.routeId, feature.geometry.coordinates]),
  )
  const segments: ShuttleSegment[] = []

  for (const route of input.transitIndex.routes) {
    const line = geometryByRouteId.get(route.id)
    if (!line) continue

    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        const fromStopId = route.stopIds[fromIndex]
        const toStopId = route.stopIds[toIndex]
        if (!fromStopId || !toStopId || fromStopId === toStopId) continue

        const record = timingByKey.get(`${route.id}:${fromStopId}->${toStopId}`)
        if (!record || record.status !== 'estimated' || record.rideSeconds === null) continue
        if (!isFiniteNonNegativeInteger(record.rideSeconds)) continue

        const fromStop = input.transitIndex.stopById.get(fromStopId)
        const toStop = input.transitIndex.stopById.get(toStopId)
        if (!fromStop || !toStop) continue

        const sliced = sliceRouteGeometry(
          line,
          [fromStop.longitude, fromStop.latitude],
          [toStop.longitude, toStop.latitude],
        )
        if (!sliced) continue

        segments.push({
          routeId: route.id,
          fromStopId,
          toStopId,
          rideSeconds: record.rideSeconds,
          record,
          geometry: sliced.geometry,
          distanceMeters: sliced.distanceMeters,
          reachesRouteTerminal: toIndex === route.stopIds.length - 1 && toStopId === route.stopIds[0],
          sequenceKey: `shuttle:${route.id}:${fromIndex}>${toIndex}`,
        })
      }
    }
  }

  return segments.sort((first, second) => compareText(first.sequenceKey, second.sequenceKey))
}

function createPlannerContext(input: PlanJourneyInput): PlannerContext {
  const validWalkingConnections = input.walkingConnections.filter(isValidWalkingConnection)
  const accesses = createStopAccesses(input, validWalkingConnections)
  const transferWalking = createTransferWalking(validWalkingConnections)
  const segments = buildShuttleSegments(input)
  const segmentsByFromStop = new Map<string, ShuttleSegment[]>()
  const segmentsByToStop = new Map<string, ShuttleSegment[]>()
  const segmentsByStopPair = new Map<string, ShuttleSegment[]>()

  for (const segment of segments) {
    addToMapSet(segmentsByFromStop, segment.fromStopId, segment)
    addToMapSet(segmentsByToStop, segment.toStopId, segment)
    addToMapSet(segmentsByStopPair, stopPairKey(segment.fromStopId, segment.toStopId), segment)
  }

  return {
    originAccesses: accesses.origin,
    destinationAccesses: accesses.destination,
    transferWalking,
    segmentsByFromStop,
    segmentsByToStop,
    segmentsByStopPair,
  }
}

function getTransferWalking(
  context: PlannerContext,
  fromStopId: string,
  toStopId: string,
): WalkingJourneyConnection | null {
  if (fromStopId === toStopId) return null
  return context.transferWalking.get(fromStopId)?.get(toStopId) ?? null
}

function canUseAsTransfer(
  first: ShuttleSegment,
  second: ShuttleSegment,
  transferWalking: WalkingJourneyConnection | null,
): boolean {
  if (first.routeId === second.routeId && !first.reachesRouteTerminal) return false
  return first.toStopId === second.fromStopId || transferWalking !== null
}

function canBoardFromOrigin(
  origin: TripEndpoint,
  segment: ShuttleSegment,
  transitIndex: TransitIndex,
): boolean {
  if (origin.kind !== 'stop') return true
  const route = transitIndex.routeById.get(segment.routeId)
  if (!route) return false
  const originIndex = route.stopIds.indexOf(origin.id)
  const boardingIndex = route.stopIds.indexOf(segment.fromStopId)
  return originIndex < 0 || boardingIndex < 0 || boardingIndex >= originIndex
}

function createJourneyCandidate(
  input: PlanJourneyInput,
  legs: readonly JourneyLeg[],
  sequenceKey: string,
): JourneyCandidate {
  const normalizedLegs = mergeConsecutiveWalkingLegs(legs)
  return {
    journey: {
      origin: input.origin.endpoint,
      destination: input.destination.endpoint,
      legs: normalizedLegs,
      totalDurationSeconds: normalizedLegs.reduce((total, leg) => total + leg.durationSeconds, 0),
      totalDistanceMeters: normalizedLegs.reduce((total, leg) => total + leg.distanceMeters, 0),
      estimateStatus: 'estimated',
      planningQuality: 'bounded',
    },
    shuttleBoardings: normalizedLegs.filter((leg) => leg.mode === 'shuttle').length,
    walkingDistanceMeters: normalizedLegs
      .filter((leg) => leg.mode === 'walking')
      .reduce((total, leg) => total + leg.distanceMeters, 0),
    sequenceKey,
  }
}

function evaluateShuttleLeg(
  segment: ShuttleSegment,
  elapsedSeconds: number,
  getShuttleWaitingSeconds: ShuttleWaitingTimeProvider,
): ShuttleJourneyLeg | null {
  const waitingSeconds = getShuttleWaitingSeconds(segment.record, {
    routeId: segment.routeId,
    boardingStopId: segment.fromStopId,
    elapsedSeconds,
  })
  if (waitingSeconds === null || !isFiniteNonNegativeInteger(waitingSeconds)) return null
  return createShuttleLeg(segment, waitingSeconds)
}

function createShuttleCandidate(
  input: PlanJourneyInput,
  originAccess: StopAccess,
  destinationAccess: StopAccess,
  first: ShuttleSegment,
  second: ShuttleSegment | null,
  transferWalking: WalkingJourneyConnection | null,
): JourneyCandidate | null {
  const legs: JourneyLeg[] = []
  const sequenceParts: string[] = []
  let elapsedSeconds = 0

  if (originAccess.walking) {
    legs.push(createWalkingLeg(originAccess.walking))
    sequenceParts.push(walkingSequenceKey(originAccess.walking))
    elapsedSeconds += originAccess.walking.durationSeconds
  }

  const firstLeg = evaluateShuttleLeg(first, elapsedSeconds, input.getShuttleWaitingSeconds)
  if (!firstLeg) return null
  legs.push(firstLeg)
  sequenceParts.push(first.sequenceKey)
  elapsedSeconds += firstLeg.durationSeconds

  if (second) {
    if (!canUseAsTransfer(first, second, transferWalking)) return null
    if (transferWalking) {
      legs.push(createWalkingLeg(transferWalking))
      sequenceParts.push(walkingSequenceKey(transferWalking))
      elapsedSeconds += transferWalking.durationSeconds
    } else {
      sequenceParts.push(`transfer:${first.toStopId}`)
    }

    const secondLeg = evaluateShuttleLeg(second, elapsedSeconds, input.getShuttleWaitingSeconds)
    if (!secondLeg) return null
    legs.push(secondLeg)
    sequenceParts.push(second.sequenceKey)
  }

  if (destinationAccess.walking) {
    legs.push(createWalkingLeg(destinationAccess.walking))
    sequenceParts.push(walkingSequenceKey(destinationAccess.walking))
  }

  return createJourneyCandidate(input, legs, sequenceParts.join('|'))
}

function compareCandidates(first: JourneyCandidate, second: JourneyCandidate): number {
  return compareNumbers(
    first.journey.totalDurationSeconds,
    second.journey.totalDurationSeconds,
  ) || compareNumbers(first.shuttleBoardings, second.shuttleBoardings) ||
    compareNumbers(first.walkingDistanceMeters, second.walkingDistanceMeters) ||
    compareNumbers(first.journey.legs.length, second.journey.legs.length) ||
    compareText(first.sequenceKey, second.sequenceKey)
}

function createDirectWalkingCandidates(
  input: PlanJourneyInput,
): JourneyCandidate[] {
  return input.walkingConnections
    .filter((connection) => (
      isValidWalkingConnection(connection) &&
      connection.from.kind === input.origin.endpoint.kind &&
      connection.from.id === input.origin.endpoint.id &&
      connection.to.kind === input.destination.endpoint.kind &&
      connection.to.id === input.destination.endpoint.id
    ))
    .map((connection) => createJourneyCandidate(
      input,
      [createWalkingLeg(connection)],
      walkingSequenceKey(connection),
    ))
}

function createShuttleCandidates(
  input: PlanJourneyInput,
  context: PlannerContext,
): JourneyCandidate[] {
  const candidates: JourneyCandidate[] = []

  for (const originAccess of context.originAccesses) {
    const firstSegments = (context.segmentsByFromStop.get(originAccess.stopId) ?? [])
      .filter((segment) => canBoardFromOrigin(input.origin.endpoint, segment, input.transitIndex))
    for (const destinationAccess of context.destinationAccesses) {
      const directSegments = context.segmentsByStopPair.get(
        stopPairKey(originAccess.stopId, destinationAccess.stopId),
      )?.filter((segment) => canBoardFromOrigin(
        input.origin.endpoint,
        segment,
        input.transitIndex,
      )) ?? []
      for (const direct of directSegments) {
        const candidate = createShuttleCandidate(
          input,
          originAccess,
          destinationAccess,
          direct,
          null,
          null,
        )
        if (candidate) candidates.push(candidate)
      }

      const secondSegments = context.segmentsByToStop.get(destinationAccess.stopId) ?? []
      for (const first of firstSegments) {
        for (const second of secondSegments) {
          const transferWalking = getTransferWalking(
            context,
            first.toStopId,
            second.fromStopId,
          )
          if (!canUseAsTransfer(first, second, transferWalking)) continue
          const candidate = createShuttleCandidate(
            input,
            originAccess,
            destinationAccess,
            first,
            second,
            transferWalking,
          )
          if (candidate) candidates.push(candidate)
        }
      }
    }
  }

  return candidates
}

/**
 * Returns the finite set of stops whose live waits can affect this bounded
 * candidate set. This is a structural preflight, not a second ranking pass.
 */
export function getCandidateBoardingStopIds(
  input: PlanJourneyInput,
): readonly string[] {
  const context = createPlannerContext(input)
  const boardingStopIds = new Set<string>()

  for (const originAccess of context.originAccesses) {
    boardingStopIds.add(originAccess.stopId)
    const firstSegments = (context.segmentsByFromStop.get(originAccess.stopId) ?? [])
      .filter((segment) => canBoardFromOrigin(input.origin.endpoint, segment, input.transitIndex))
    for (const first of firstSegments) {
      for (const destinationAccess of context.destinationAccesses) {
        const secondSegments = context.segmentsByToStop.get(destinationAccess.stopId) ?? []
        for (const second of secondSegments) {
          const transferWalking = getTransferWalking(
            context,
            first.toStopId,
            second.fromStopId,
          )
          if (canUseAsTransfer(first, second, transferWalking)) {
            boardingStopIds.add(second.fromStopId)
          }
        }
      }
    }
  }

  return [...boardingStopIds].sort(compareText)
}

/**
 * The planner is exhaustive only within the deliberate NUS candidate policy:
 * five endpoint stops and at most one shuttle transfer. It must therefore
 * remain a recommended, bounded Journey rather than claim global optimality.
 */
export function planJourneyCandidates(
  input: PlanJourneyInput,
): readonly Journey[] {
  const context = createPlannerContext(input)
  return [
    ...createDirectWalkingCandidates(input),
    ...createShuttleCandidates(input, context),
  ]
    .sort(compareCandidates)
    .map((candidate) => candidate.journey)
}

export function planJourney(input: PlanJourneyInput): Journey | null {
  return planJourneyCandidates(input)[0] ?? null
}

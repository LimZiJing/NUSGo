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
import type {
  Journey,
  JourneyEndpointLocation,
  JourneyLineString,
  JourneyLeg,
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

export interface PlanJourneyInput {
  readonly origin: JourneyEndpointLocation
  readonly destination: JourneyEndpointLocation
  readonly transitIndex: TransitIndex
  readonly routeGeometry: TransitRouteGeometry
  readonly shuttleTiming: ShuttleTimingData
  readonly walkingConnections: readonly WalkingJourneyConnection[]
  readonly getShuttleWaitingSeconds: ShuttleWaitingTimeProvider
}

interface JourneyEdgeBase {
  readonly to: TripEndpoint
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly sequenceKey: string
}

interface WalkingJourneyEdge extends JourneyEdgeBase {
  readonly kind: 'walking'
  readonly durationSeconds: number
  readonly leg: WalkingJourneyLeg
}

interface ShuttleJourneyEdge extends JourneyEdgeBase {
  readonly kind: 'shuttle'
  readonly routeId: string
  readonly fromStopId: string
  readonly toStopId: string
  readonly rideSeconds: number
  readonly record: ShuttleTimingRecord
  readonly geometry: JourneyLineString
  readonly reachesRouteTerminal: boolean
}

type JourneyEdge = WalkingJourneyEdge | ShuttleJourneyEdge

interface ResolvedJourneyEdge {
  readonly to: TripEndpoint
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly reachesRouteTerminal: boolean
  readonly leg: JourneyLeg
  readonly sequenceKey: string
}

interface JourneyPath {
  readonly nodeKey: string
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly lastShuttleRouteId: string | null
  readonly lastShuttleReachedTerminal: boolean
  readonly legs: readonly JourneyLeg[]
  readonly sequenceKey: string
  readonly visitedStateKeys: ReadonlySet<string>
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

function endpointKey(endpoint: TripEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`
}

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

function createNodeSet(
  origin: JourneyEndpointLocation,
  destination: JourneyEndpointLocation,
  transitIndex: TransitIndex,
): Set<string> {
  const nodes = new Set([endpointKey(origin.endpoint), endpointKey(destination.endpoint)])
  for (const stop of transitIndex.stops) nodes.add(endpointKey({ kind: 'stop', id: stop.id }))
  return nodes
}

function addEdge(
  graph: Map<string, JourneyEdge[]>,
  from: TripEndpoint,
  edge: JourneyEdge,
): void {
  const edges = graph.get(endpointKey(from))
  if (edges) edges.push(edge)
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

function comparePaths(first: JourneyPath, second: JourneyPath): number {
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

function journeyPathStateKey(
  path: Pick<JourneyPath, 'nodeKey' | 'lastShuttleRouteId' | 'lastShuttleReachedTerminal' | 'shuttleBoardings'>,
): string {
  return `${path.nodeKey}\u0000${path.lastShuttleRouteId ?? ''}\u0000${path.lastShuttleReachedTerminal ? 'terminal' : ''}\u0000${path.shuttleBoardings > 0 ? 'boarded' : 'unboarded'}`
}

function extendPath(path: JourneyPath, edge: ResolvedJourneyEdge): JourneyPath {
  const nextPath = {
    nodeKey: endpointKey(edge.to),
    durationSeconds: path.durationSeconds + edge.durationSeconds,
    distanceMeters: path.distanceMeters + edge.distanceMeters,
    walkingDistanceMeters: path.walkingDistanceMeters + edge.walkingDistanceMeters,
    shuttleBoardings: path.shuttleBoardings + edge.shuttleBoardings,
    lastShuttleRouteId: edge.leg.mode === 'shuttle' ? edge.leg.routeId : null,
    lastShuttleReachedTerminal: edge.leg.mode === 'shuttle' ? edge.reachesRouteTerminal : false,
    legs: [...path.legs, edge.leg],
    sequenceKey: path.sequenceKey
      ? `${path.sequenceKey}|${edge.sequenceKey}`
      : edge.sequenceKey,
  }
  return {
    ...nextPath,
    visitedStateKeys: new Set([
      ...path.visitedStateKeys,
      journeyPathStateKey(nextPath),
    ]),
  }
}

function dominatesPath(first: JourneyPath, second: JourneyPath): boolean {
  // Different arrival times can produce different live shuttle choices. Only
  // compare labels when the future timing context is exactly the same.
  return first.durationSeconds === second.durationSeconds && comparePaths(first, second) < 0
}

function retainPathLabels(
  labelsByState: Map<string, JourneyPath[]>,
  path: JourneyPath,
): boolean {
  const stateKey = journeyPathStateKey(path)
  const labels = labelsByState.get(stateKey) ?? []
  if (labels.some((label) => label.sequenceKey === path.sequenceKey)) return false

  if (labels.some((label) => dominatesPath(label, path))) return false

  const retainedLabels = labels.filter((label) => !dominatesPath(path, label))
  retainedLabels.push(path)
  retainedLabels.sort(comparePaths)
  labelsByState.set(stateKey, retainedLabels)

  return labelsByState.get(stateKey)?.some((label) => label.sequenceKey === path.sequenceKey) ?? false
}

function hasPathLabel(
  labelsByState: ReadonlyMap<string, readonly JourneyPath[]>,
  path: JourneyPath,
): boolean {
  return labelsByState.get(journeyPathStateKey(path))?.some(
    (label) => label.sequenceKey === path.sequenceKey,
  ) ?? false
}

function isUpstreamBoarding(
  origin: TripEndpoint,
  edge: ShuttleJourneyEdge,
  transitIndex: TransitIndex,
): boolean {
  if (origin.kind !== 'stop') return false
  const route = transitIndex.routeById.get(edge.routeId)
  if (!route) return false
  const originIndex = route.stopIds.indexOf(origin.id)
  const boardingIndex = route.stopIds.indexOf(edge.fromStopId)
  return originIndex >= 0 && boardingIndex >= 0 && boardingIndex < originIndex
}

function resolveJourneyEdge(
  edge: JourneyEdge,
  elapsedSeconds: number,
  getShuttleWaitingSeconds: ShuttleWaitingTimeProvider,
): ResolvedJourneyEdge | null {
  if (edge.kind === 'walking') {
    return { ...edge, reachesRouteTerminal: false }
  }

  const waitingSeconds = getShuttleWaitingSeconds(edge.record, {
    routeId: edge.routeId,
    boardingStopId: edge.fromStopId,
    elapsedSeconds,
  })
  if (
    waitingSeconds === null ||
    !isFiniteNonNegativeInteger(waitingSeconds) ||
    !isFiniteNonNegativeInteger(edge.rideSeconds)
  ) return null

  return {
    to: edge.to,
    durationSeconds: waitingSeconds + edge.rideSeconds,
    distanceMeters: edge.distanceMeters,
    walkingDistanceMeters: edge.walkingDistanceMeters,
    shuttleBoardings: edge.shuttleBoardings,
    reachesRouteTerminal: edge.kind === 'shuttle' && edge.reachesRouteTerminal,
    leg: createShuttleLeg(
      edge.routeId,
      edge.fromStopId,
      edge.toStopId,
      waitingSeconds,
      edge.rideSeconds,
      edge.geometry,
      edge.distanceMeters,
    ),
    sequenceKey: edge.sequenceKey,
  }
}

function buildGraph(input: PlanJourneyInput): Map<string, JourneyEdge[]> {
  const graph = new Map<string, JourneyEdge[]>()
  const nodes = createNodeSet(input.origin, input.destination, input.transitIndex)
  for (const node of nodes) graph.set(node, [])

  for (const connection of input.walkingConnections) {
    if (
      !nodes.has(endpointKey(connection.from)) ||
      !nodes.has(endpointKey(connection.to)) ||
      !isFiniteNonNegativeInteger(connection.durationSeconds) ||
      !isFiniteNonNegativeInteger(connection.distanceMeters) ||
      !isValidLineString(connection.geometry)
    ) continue

    const leg = createWalkingLeg(connection)
    addEdge(graph, connection.from, {
      kind: 'walking',
      to: connection.to,
      durationSeconds: connection.durationSeconds,
      distanceMeters: connection.distanceMeters,
      walkingDistanceMeters: connection.distanceMeters,
      shuttleBoardings: 0,
      leg,
      sequenceKey: `walking:${endpointKey(connection.from)}>${endpointKey(connection.to)}`,
    })
  }

  const timingByKey = new Map(
    input.shuttleTiming.records.map((record) => [
      `${record.routeId}:${record.fromStopId}->${record.toStopId}`,
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
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        const fromStopId = route.stopIds[fromIndex]
        const toStopId = route.stopIds[toIndex]
        if (fromStopId === toStopId) continue
        const record = timingByKey.get(`${route.id}:${fromStopId}->${toStopId}`)
        if (
          !record ||
          record.status !== 'estimated' ||
          record.rideSeconds === null
        ) continue

        if (!isFiniteNonNegativeInteger(record.rideSeconds)) continue

        const fromStop = input.transitIndex.stopById.get(fromStopId)
        const toStop = input.transitIndex.stopById.get(toStopId)
        if (!fromStop || !toStop) continue
        const sliced = sliceRouteGeometry(
          line,
          toPosition(fromStop.longitude, fromStop.latitude),
          toPosition(toStop.longitude, toStop.latitude),
        )
        if (!sliced) continue

        addEdge(graph, { kind: 'stop', id: fromStopId }, {
          kind: 'shuttle',
          to: { kind: 'stop', id: toStopId },
          distanceMeters: sliced.distanceMeters,
          walkingDistanceMeters: 0,
          shuttleBoardings: 1,
          routeId: route.id,
          fromStopId,
          toStopId,
          rideSeconds: record.rideSeconds,
          record,
          geometry: sliced.geometry,
          sequenceKey: `shuttle:${route.id}:${fromStopId}>${toStopId}`,
          reachesRouteTerminal: toIndex === route.stopIds.length - 1 && toStopId === route.stopIds[0],
        })
      }
    }
  }

  for (const edges of graph.values()) {
    edges.sort((first, second) => compareText(first.sequenceKey, second.sequenceKey))
  }
  return graph
}

function findBestPath(
  graph: Map<string, JourneyEdge[]>,
  origin: TripEndpoint,
  destination: TripEndpoint,
  transitIndex: TransitIndex,
  getShuttleWaitingSeconds: ShuttleWaitingTimeProvider,
): JourneyPath | null {
  const originKey = endpointKey(origin)
  const destinationKey = endpointKey(destination)
  const initialPathState = {
    nodeKey: originKey,
    durationSeconds: 0,
    distanceMeters: 0,
    walkingDistanceMeters: 0,
    shuttleBoardings: 0,
    lastShuttleRouteId: null,
    lastShuttleReachedTerminal: false,
    legs: [],
    sequenceKey: '',
  }
  const initialPath: JourneyPath = {
    ...initialPathState,
    visitedStateKeys: new Set([journeyPathStateKey(initialPathState)]),
  }
  const queue: JourneyPath[] = [initialPath]
  const labelsByState = new Map<string, JourneyPath[]>()
  retainPathLabels(labelsByState, initialPath)
  let bestDestinationPath: JourneyPath | null = null

  while (queue.length > 0) {
    queue.sort(comparePaths)
    const path = queue.shift()!
    if (!hasPathLabel(labelsByState, path)) continue
    if (bestDestinationPath && path.durationSeconds > bestDestinationPath.durationSeconds) continue
    if (path.nodeKey === destinationKey) {
      if (!bestDestinationPath || comparePaths(path, bestDestinationPath) < 0) {
        bestDestinationPath = path
      }
      continue
    }

    for (const edge of graph.get(path.nodeKey) ?? []) {
      if (
        edge.kind === 'shuttle' &&
        path.shuttleBoardings === 0 &&
        isUpstreamBoarding(origin, edge, transitIndex)
      ) continue
      // A continuous ride cannot become another boarding on the same route.
      if (
        edge.kind === 'shuttle' &&
        path.lastShuttleRouteId === edge.routeId &&
        !path.lastShuttleReachedTerminal
      ) continue
      const resolvedEdge = resolveJourneyEdge(edge, path.durationSeconds, getShuttleWaitingSeconds)
      if (!resolvedEdge) continue
      const nextPath = extendPath(path, resolvedEdge)
      if (path.visitedStateKeys.has(journeyPathStateKey(nextPath))) continue
      if (retainPathLabels(labelsByState, nextPath)) {
        queue.push(nextPath)
      }
    }
  }

  return bestDestinationPath
}

export function planJourney(input: PlanJourneyInput): Journey | null {
  const graph = buildGraph(input)
  const path = findBestPath(
    graph,
    input.origin.endpoint,
    input.destination.endpoint,
    input.transitIndex,
    input.getShuttleWaitingSeconds,
  )
  if (!path || path.legs.length === 0) return null

  const legs = mergeConsecutiveWalkingLegs(path.legs)
  return {
    origin: input.origin.endpoint,
    destination: input.destination.endpoint,
    legs,
    totalDurationSeconds: path.durationSeconds,
    totalDistanceMeters: path.distanceMeters,
    estimateStatus: 'estimated',
  }
}

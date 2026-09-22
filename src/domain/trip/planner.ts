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

export type ShuttleWaitingTimeProvider = (
  record: ShuttleTimingRecord,
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

interface JourneyEdge {
  readonly to: TripEndpoint
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly leg: JourneyLeg
  readonly sequenceKey: string
}

interface JourneyPath {
  readonly nodeKey: string
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly walkingDistanceMeters: number
  readonly shuttleBoardings: number
  readonly legs: readonly JourneyLeg[]
  readonly sequenceKey: string
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
): ProjectedPoint | null {
  let distanceAlongLine = 0
  let best: ProjectedPoint | null = null

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
    if (!best || candidate.distanceToLine < best.distanceToLine) best = candidate
    distanceAlongLine += segmentLength
  }

  return best
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
  const from = projectPointOntoLine(fromStop, line)
  const to = projectPointOntoLine(toStop, line)
  if (!from || !to || to.distanceAlongLine <= from.distanceAlongLine + PROJECTION_EPSILON_METRES) {
    return null
  }

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

function extendPath(path: JourneyPath, edge: JourneyEdge): JourneyPath {
  return {
    nodeKey: endpointKey(edge.to),
    durationSeconds: path.durationSeconds + edge.durationSeconds,
    distanceMeters: path.distanceMeters + edge.distanceMeters,
    walkingDistanceMeters: path.walkingDistanceMeters + edge.walkingDistanceMeters,
    shuttleBoardings: path.shuttleBoardings + edge.shuttleBoardings,
    legs: [...path.legs, edge.leg],
    sequenceKey: path.sequenceKey
      ? `${path.sequenceKey}|${edge.sequenceKey}`
      : edge.sequenceKey,
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
        const record = timingByKey.get(`${route.id}:${fromStopId}->${toStopId}`)
        if (
          !record ||
          record.status !== 'estimated' ||
          record.rideSeconds === null
        ) continue

        const waitingSeconds = input.getShuttleWaitingSeconds(record)
        if (
          waitingSeconds === null ||
          !isFiniteNonNegativeInteger(waitingSeconds) ||
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

        const leg = createShuttleLeg(
          route.id,
          fromStopId,
          toStopId,
          waitingSeconds,
          record.rideSeconds,
          sliced.geometry,
          sliced.distanceMeters,
        )
        addEdge(graph, { kind: 'stop', id: fromStopId }, {
          to: { kind: 'stop', id: toStopId },
          durationSeconds: leg.durationSeconds,
          distanceMeters: leg.distanceMeters,
          walkingDistanceMeters: 0,
          shuttleBoardings: 1,
          leg,
          sequenceKey: `shuttle:${route.id}:${fromStopId}>${toStopId}`,
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
): JourneyPath | null {
  const originKey = endpointKey(origin)
  const destinationKey = endpointKey(destination)
  const initialPath: JourneyPath = {
    nodeKey: originKey,
    durationSeconds: 0,
    distanceMeters: 0,
    walkingDistanceMeters: 0,
    shuttleBoardings: 0,
    legs: [],
    sequenceKey: '',
  }
  const queue: JourneyPath[] = [initialPath]
  const bestByNode = new Map([[originKey, initialPath]])

  while (queue.length > 0) {
    queue.sort(comparePaths)
    const path = queue.shift()!
    const bestForNode = bestByNode.get(path.nodeKey)
    if (!bestForNode || comparePaths(path, bestForNode) !== 0) continue
    if (path.nodeKey === destinationKey) return path

    for (const edge of graph.get(path.nodeKey) ?? []) {
      const nextPath = extendPath(path, edge)
      const currentBest = bestByNode.get(nextPath.nodeKey)
      if (!currentBest || comparePaths(nextPath, currentBest) < 0) {
        bestByNode.set(nextPath.nodeKey, nextPath)
        queue.push(nextPath)
      }
    }
  }

  return null
}

export function planJourney(input: PlanJourneyInput): Journey | null {
  const graph = buildGraph(input)
  const path = findBestPath(graph, input.origin.endpoint, input.destination.endpoint)
  if (!path || path.legs.length === 0) return null

  return {
    origin: input.origin.endpoint,
    destination: input.destination.endpoint,
    legs: path.legs,
    totalDurationSeconds: path.durationSeconds,
    totalDistanceMeters: path.distanceMeters,
    estimateStatus: 'estimated',
  }
}

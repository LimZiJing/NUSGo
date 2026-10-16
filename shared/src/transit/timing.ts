import type {
  TransitGeoJsonPosition,
  TransitNetwork,
  BusRoute,
  BusRouteGeometry,
} from './types.ts'

export const SHUTTLE_TIMING_DATA_VERSION = 1
export const SHUTTLE_TIMING_METHOD_VERSION = 'geometry-effective-speed-v1'
export const SHUTTLE_TIMING_METHOD = 'geometry-effective-speed'
export const SHUTTLE_TIMING_SOURCE = 'canonical-route-geometry'
export const SHUTTLE_TIMING_WAITING_POLICY = 'unavailable-without-verified-headway'

const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320
const MAX_STOP_DISTANCE_METRES = 50
const PROJECTION_EPSILON_METRES = 0.001
const BASELINE_SPEED_MPS = 15 * 1609.344 / 3600
const LOWER_SPEED_MPS = 10 * 1609.344 / 3600
const UPPER_SPEED_MPS = 20 * 1609.344 / 3600
const INTERMEDIATE_STOP_DWELL_SECONDS = 20
const LOWER_DWELL_SECONDS = 10
const UPPER_DWELL_SECONDS = 30

export interface ShuttleTimingMetadata {
  readonly version: number
  readonly generatedAt: string
  readonly source: string
  readonly method: string
  readonly methodVersion: string
  readonly baselineSpeedMps: number
  readonly lowerSpeedMps: number
  readonly upperSpeedMps: number
  readonly intermediateStopDwellSeconds: number
  readonly lowerDwellSeconds: number
  readonly upperDwellSeconds: number
  readonly waitingPolicy: string
  readonly waitingSeconds: null
  readonly observedAt: string | null
  readonly geometryVerifiedAt: string
}

export interface ShuttleTimingRecord {
  readonly routeId: string
  readonly fromStopId: string
  readonly toStopId: string
  readonly status: 'estimated' | 'unavailable'
  readonly rideSeconds: number | null
  readonly rideSecondsLowerBound: number | null
  readonly rideSecondsUpperBound: number | null
  readonly waitingSeconds: null
  readonly source: string
  readonly method: string
  readonly methodVersion: string
  readonly observedAt: string | null
  readonly geometryVerifiedAt: string
  readonly unavailableReason: string | null
}

export interface ShuttleTimingData {
  readonly version: number
  readonly metadata: ShuttleTimingMetadata
  readonly records: readonly ShuttleTimingRecord[]
}

export class TransitTimingValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'TransitTimingValidationError'
    this.issues = Object.freeze([...issues])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function requireDate(value: unknown, label: string, issues: string[]): void {
  if (!isDate(value)) issues.push(`${label} must be a YYYY-MM-DD date`)
}

function requireText(value: unknown, label: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) issues.push(`${label} must be a non-empty string`)
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

export interface LineProjection {
  readonly segmentIndex: number
  readonly distanceAlongLine: number
  readonly distanceToLine: number
  readonly coordinate: TransitGeoJsonPosition
}

function projectPointOntoLine(
  point: TransitGeoJsonPosition,
  line: readonly TransitGeoJsonPosition[],
): readonly LineProjection[] {
  const projections: LineProjection[] = []
  let distanceAlongLine = 0

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
    projections.push({
      segmentIndex: index,
      distanceAlongLine: distanceAlongLine + segmentLength * ratio,
      distanceToLine: distanceBetween(point, projected),
      coordinate: projected,
    })
    distanceAlongLine += segmentLength
  }

  return projections.sort((first, second) => first.distanceAlongLine - second.distanceAlongLine)
}

function selectOrderedProjections(
  candidatesByStop: readonly (readonly LineProjection[])[],
  stopIndex: number,
  previousDistance: number,
): readonly LineProjection[] | null {
  if (stopIndex === candidatesByStop.length) return []

  const candidates = candidatesByStop[stopIndex]
    .filter((candidate) => (
      candidate.distanceToLine <= MAX_STOP_DISTANCE_METRES &&
      candidate.distanceAlongLine > previousDistance + PROJECTION_EPSILON_METRES
    ))

  for (const candidate of candidates) {
    const remaining = selectOrderedProjections(
      candidatesByStop,
      stopIndex + 1,
      candidate.distanceAlongLine,
    )
    if (remaining) return [candidate, ...remaining]
  }

  return null
}

/**
 * Places every stop of a Route on its line in Route order, one projection per stop index.
 * Loop Routes pass near some stops more than once, so nearest-point matching alone can pick the wrong pass.
 */
export function placeRouteStopsOnLine(
  stopIds: readonly string[],
  stopsById: ReadonlyMap<string, { readonly longitude: number; readonly latitude: number }>,
  line: readonly TransitGeoJsonPosition[],
): readonly LineProjection[] | null {
  const candidatesByStop = stopIds.map((stopId) => {
    const stop = stopsById.get(stopId)
    if (!stop) return []
    return projectPointOntoLine([stop.longitude, stop.latitude], line)
  })
  return selectOrderedProjections(candidatesByStop, 0, Number.NEGATIVE_INFINITY)
}

function routeProjections(
  route: BusRoute,
  network: TransitNetwork,
  line: readonly TransitGeoJsonPosition[],
): readonly LineProjection[] | null {
  return placeRouteStopsOnLine(route.stopIds, new Map(network.stops.map((stop) => [stop.id, stop])), line)
}

function createUnavailableRecord(
  route: BusRoute,
  fromStopId: string,
  toStopId: string,
  geometryVerifiedAt: string,
  reason: string,
): ShuttleTimingRecord {
  return {
    routeId: route.id,
    fromStopId,
    toStopId,
    status: 'unavailable',
    rideSeconds: null,
    rideSecondsLowerBound: null,
    rideSecondsUpperBound: null,
    waitingSeconds: null,
    source: SHUTTLE_TIMING_SOURCE,
    method: SHUTTLE_TIMING_METHOD,
    methodVersion: SHUTTLE_TIMING_METHOD_VERSION,
    observedAt: null,
    geometryVerifiedAt,
    unavailableReason: reason,
  }
}

export function generateShuttleTimingData(
  network: TransitNetwork,
  geometry: BusRouteGeometry,
  generatedAt: string,
): ShuttleTimingData {
  if (!isDate(generatedAt)) throw new Error('Shuttle timing generatedAt must be a YYYY-MM-DD date')

  const geometryByRouteId = new Map(
    geometry.features.map((feature) => [feature.properties.routeId, feature.geometry.coordinates]),
  )
  const records: ShuttleTimingRecord[] = []

  for (const route of network.routes) {
    const line = geometryByRouteId.get(route.id)
    const projections = line ? routeProjections(route, network, line) : null
    const unavailableReason = !line
      ? `No canonical route geometry exists for ${route.id}`
      : !projections
        ? `Canonical route geometry cannot place ${route.id} stops in order`
        : null

    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        const fromStopId = route.stopIds[fromIndex]
        const toStopId = route.stopIds[toIndex]
        if (fromStopId === toStopId) continue
        if (unavailableReason || !projections) {
          records.push(createUnavailableRecord(
            route,
            fromStopId,
            toStopId,
            network.metadata.verifiedAt,
            unavailableReason ?? 'Route timing is unavailable',
          ))
          continue
        }

        const distanceMeters = projections[toIndex].distanceAlongLine - projections[fromIndex].distanceAlongLine
        const intermediateStops = toIndex - fromIndex - 1
        const rideSeconds = Math.max(
          1,
          Math.round(distanceMeters / BASELINE_SPEED_MPS + intermediateStops * INTERMEDIATE_STOP_DWELL_SECONDS),
        )
        const rideSecondsLowerBound = Math.max(
          1,
          Math.round(distanceMeters / UPPER_SPEED_MPS + intermediateStops * LOWER_DWELL_SECONDS),
        )
        const rideSecondsUpperBound = Math.max(
          rideSeconds,
          Math.round(distanceMeters / LOWER_SPEED_MPS + intermediateStops * UPPER_DWELL_SECONDS),
        )
        records.push({
          routeId: route.id,
          fromStopId,
          toStopId,
          status: 'estimated',
          rideSeconds,
          rideSecondsLowerBound,
          rideSecondsUpperBound,
          waitingSeconds: null,
          source: SHUTTLE_TIMING_SOURCE,
          method: SHUTTLE_TIMING_METHOD,
          methodVersion: SHUTTLE_TIMING_METHOD_VERSION,
          observedAt: null,
          geometryVerifiedAt: network.metadata.verifiedAt,
          unavailableReason: null,
        })
      }
    }
  }

  return {
    version: SHUTTLE_TIMING_DATA_VERSION,
    metadata: {
      version: SHUTTLE_TIMING_DATA_VERSION,
      generatedAt,
      source: 'shuttle-network.json and shuttle-routes.geojson',
      method: SHUTTLE_TIMING_METHOD,
      methodVersion: SHUTTLE_TIMING_METHOD_VERSION,
      baselineSpeedMps: BASELINE_SPEED_MPS,
      lowerSpeedMps: LOWER_SPEED_MPS,
      upperSpeedMps: UPPER_SPEED_MPS,
      intermediateStopDwellSeconds: INTERMEDIATE_STOP_DWELL_SECONDS,
      lowerDwellSeconds: LOWER_DWELL_SECONDS,
      upperDwellSeconds: UPPER_DWELL_SECONDS,
      waitingPolicy: SHUTTLE_TIMING_WAITING_POLICY,
      waitingSeconds: null,
      observedAt: null,
      geometryVerifiedAt: network.metadata.verifiedAt,
    },
    records,
  }
}

function validateMetadata(
  value: unknown,
  network: TransitNetwork,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push('Shuttle timing metadata must be an object')
    return
  }
  if (value.version !== SHUTTLE_TIMING_DATA_VERSION) issues.push(`Shuttle timing metadata version must be ${SHUTTLE_TIMING_DATA_VERSION}`)
  requireDate(value.generatedAt, 'Shuttle timing metadata generatedAt', issues)
  requireText(value.source, 'Shuttle timing metadata source', issues)
  if (value.method !== SHUTTLE_TIMING_METHOD) issues.push(`Shuttle timing metadata method must be ${SHUTTLE_TIMING_METHOD}`)
  if (value.methodVersion !== SHUTTLE_TIMING_METHOD_VERSION) issues.push(`Shuttle timing metadata methodVersion must be ${SHUTTLE_TIMING_METHOD_VERSION}`)
  for (const [key, label] of [
    ['baselineSpeedMps', 'baseline speed'],
    ['lowerSpeedMps', 'lower speed'],
    ['upperSpeedMps', 'upper speed'],
    ['intermediateStopDwellSeconds', 'intermediate stop dwell'],
    ['lowerDwellSeconds', 'lower dwell'],
    ['upperDwellSeconds', 'upper dwell'],
  ] as const) {
    if (!isFiniteNumber(value[key]) || value[key] <= 0) issues.push(`Shuttle timing metadata ${label} must be positive`)
  }
  if (isFiniteNumber(value.lowerSpeedMps) && isFiniteNumber(value.baselineSpeedMps) && value.lowerSpeedMps > value.baselineSpeedMps) {
    issues.push('Shuttle timing metadata lower speed must not exceed baseline speed')
  }
  if (isFiniteNumber(value.upperSpeedMps) && isFiniteNumber(value.baselineSpeedMps) && value.upperSpeedMps < value.baselineSpeedMps) {
    issues.push('Shuttle timing metadata upper speed must not be below baseline speed')
  }
  if (isFiniteNumber(value.lowerDwellSeconds) && isFiniteNumber(value.intermediateStopDwellSeconds) && value.lowerDwellSeconds > value.intermediateStopDwellSeconds) {
    issues.push('Shuttle timing metadata lower dwell must not exceed intermediate stop dwell')
  }
  if (isFiniteNumber(value.upperDwellSeconds) && isFiniteNumber(value.intermediateStopDwellSeconds) && value.upperDwellSeconds < value.intermediateStopDwellSeconds) {
    issues.push('Shuttle timing metadata upper dwell must not be below intermediate stop dwell')
  }
  if (value.waitingPolicy !== SHUTTLE_TIMING_WAITING_POLICY) issues.push(`Shuttle timing metadata waitingPolicy must be ${SHUTTLE_TIMING_WAITING_POLICY}`)
  if (value.waitingSeconds !== null) issues.push('Shuttle timing metadata waitingSeconds must be null')
  if (value.observedAt !== null) requireDate(value.observedAt, 'Shuttle timing metadata observedAt', issues)
  requireDate(value.geometryVerifiedAt, 'Shuttle timing metadata geometryVerifiedAt', issues)
  if (value.geometryVerifiedAt !== network.metadata.verifiedAt) {
    issues.push('Shuttle timing geometry verification date does not match the transit network')
  }
}

function validateRecord(
  value: unknown,
  index: number,
  network: TransitNetwork,
  expectedKeys: Set<string>,
  seenKeys: Set<string>,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`Shuttle timing record ${index} must be an object`)
    return
  }
  const routeId = value.routeId
  const fromStopId = value.fromStopId
  const toStopId = value.toStopId
  if (typeof routeId !== 'string' || typeof fromStopId !== 'string' || typeof toStopId !== 'string') {
    issues.push(`Shuttle timing record ${index} must identify a route and two stops`)
    return
  }

  const route = network.routes.find((candidate) => candidate.id === routeId)
  if (!route) {
    issues.push(`Shuttle timing record ${index} references unknown route: ${routeId}`)
    return
  }
  const fromIndex = route.stopIds.indexOf(fromStopId)
  const laterToIndex = route.stopIds.findIndex((stopId, index) => index > fromIndex && stopId === toStopId)
  const toIndex = laterToIndex >= 0 ? laterToIndex : route.stopIds.indexOf(toStopId)
  if (fromIndex < 0 || toIndex < 0) {
    issues.push(`Shuttle timing record ${index} references stops outside route ${routeId}`)
    return
  }
  if (fromStopId === toStopId || fromIndex >= toIndex) {
    issues.push(`Shuttle timing record ${index} is not in the verified direction: ${routeId}:${fromStopId}->${toStopId}`)
    return
  }

  const key = `${routeId}:${fromStopId}->${toStopId}`
  if (!expectedKeys.has(key)) issues.push(`Shuttle timing record ${index} is not an approved stop pair: ${key}`)
  if (seenKeys.has(key)) issues.push(`duplicate timing record for ${key}`)
  seenKeys.add(key)

  if (value.status !== 'estimated' && value.status !== 'unavailable') {
    issues.push(`Shuttle timing record ${index} has an invalid status`)
  }
  if (value.source !== SHUTTLE_TIMING_SOURCE) issues.push(`Shuttle timing record ${index} source must be ${SHUTTLE_TIMING_SOURCE}`)
  if (value.method !== SHUTTLE_TIMING_METHOD) issues.push(`Shuttle timing record ${index} method must be ${SHUTTLE_TIMING_METHOD}`)
  if (value.methodVersion !== SHUTTLE_TIMING_METHOD_VERSION) issues.push(`Shuttle timing record ${index} methodVersion must be ${SHUTTLE_TIMING_METHOD_VERSION}`)
  if (value.observedAt !== null) requireDate(value.observedAt, `Shuttle timing record ${index} observedAt`, issues)
  requireDate(value.geometryVerifiedAt, `Shuttle timing record ${index} geometryVerifiedAt`, issues)
  if (value.geometryVerifiedAt !== network.metadata.verifiedAt) issues.push(`Shuttle timing record ${index} has stale geometry provenance`)
  if (value.waitingSeconds !== null) issues.push(`Shuttle timing record ${index} waitingSeconds must be null`)

  if (value.status === 'estimated') {
    for (const [keyName, label] of [
      ['rideSeconds', 'ride seconds'],
      ['rideSecondsLowerBound', 'lower ride bound'],
      ['rideSecondsUpperBound', 'upper ride bound'],
    ] as const) {
      if (!isFiniteNumber(value[keyName]) || !Number.isInteger(value[keyName]) || value[keyName] < 1) {
        issues.push(`Shuttle timing record ${index} ${label} must be a positive integer`)
      }
    }
    if (isFiniteNumber(value.rideSeconds) && isFiniteNumber(value.rideSecondsLowerBound) && value.rideSecondsLowerBound > value.rideSeconds) {
      issues.push(`Shuttle timing record ${index} lower ride bound exceeds ride seconds`)
    }
    if (isFiniteNumber(value.rideSeconds) && isFiniteNumber(value.rideSecondsUpperBound) && value.rideSeconds > value.rideSecondsUpperBound) {
      issues.push(`Shuttle timing record ${index} ride seconds exceeds upper ride bound`)
    }
    if (value.unavailableReason !== null) issues.push(`Shuttle timing record ${index} unavailableReason must be null for estimates`)
  } else {
    for (const keyName of ['rideSeconds', 'rideSecondsLowerBound', 'rideSecondsUpperBound'] as const) {
      if (value[keyName] !== null) issues.push(`Shuttle timing record ${index} ${keyName} must be null when unavailable`)
    }
    requireText(value.unavailableReason, `Shuttle timing record ${index} unavailableReason`, issues)
  }
}

export function validateShuttleTimingData(
  input: unknown,
  network: TransitNetwork,
): ShuttleTimingData {
  const issues: string[] = []
  if (!isRecord(input)) throw new TransitTimingValidationError(['Shuttle timing data must be an object'])
  if (input.version !== SHUTTLE_TIMING_DATA_VERSION) issues.push(`Shuttle timing version must be ${SHUTTLE_TIMING_DATA_VERSION}`)
  validateMetadata(input.metadata, network, issues)

  const expectedKeys = new Set<string>()
  for (const route of network.routes) {
    for (let fromIndex = 0; fromIndex < route.stopIds.length - 1; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < route.stopIds.length; toIndex += 1) {
        if (route.stopIds[fromIndex] === route.stopIds[toIndex]) continue
        expectedKeys.add(`${route.id}:${route.stopIds[fromIndex]}->${route.stopIds[toIndex]}`)
      }
    }
  }

  const seenKeys = new Set<string>()
  if (!Array.isArray(input.records)) {
    issues.push('Shuttle timing records must be an array')
  } else {
    input.records.forEach((record, index) => validateRecord(record, index, network, expectedKeys, seenKeys, issues))
  }
  for (const key of expectedKeys) {
    if (!seenKeys.has(key)) issues.push(`missing timing record for ${key}`)
  }
  if (issues.length > 0) throw new TransitTimingValidationError(issues)
  return input as unknown as ShuttleTimingData
}

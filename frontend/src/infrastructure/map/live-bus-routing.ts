import type { TransitGeoJsonPosition } from '@nusgo/shared/transit/types'
import type { LiveBusRouteMatchingOptions } from '../../app/contracts/map'

const EARTH_RADIUS_METERS = 6_371_008.8
const METERS_PER_DEGREE = Math.PI * EARTH_RADIUS_METERS / 180
// At the 30-second refresh cadence, 18 m/s plus 100 m allows 640 m, below the reported ~2 km jumps.
const DEFAULT_MAXIMUM_SPEED_METERS_PER_SECOND = 18
const DEFAULT_GPS_MOVEMENT_TOLERANCE_METERS = 100
// Keep alternate branches within 25 m of the nearest GPS projection available for scoring.
const DEFAULT_BRANCH_DISTANCE_TOLERANCE_METERS = 25
// A 180-degree disagreement adds 270 score units, enough to distinguish the close-branch fixture.
const DEFAULT_HEADING_PREFERENCE_WEIGHT = 1.5
// The 90-second horizon matches three misses at the existing 30-second polling cadence.
const DEFAULT_CONTINUITY_HORIZON_MS = 90_000

export interface RoutePosition {
  readonly coordinate: readonly [number, number]
  readonly progressMeters: number
}

export interface RoutePositionBaseline {
  readonly progressMeters: number
  readonly observedAtMs: number
}

export type VehicleRoutePositionMatch =
  | {
    readonly kind: 'matched'
    readonly continuity: 'initial' | 'reacquired'
    readonly position: RoutePosition
    readonly progressDeltaMeters: null
  }
  | {
    readonly kind: 'matched'
    readonly continuity: 'continuous'
    readonly position: RoutePosition
    readonly progressDeltaMeters: number
  }
  | { readonly kind: 'rejected' }

interface RouteCandidate extends RoutePosition {
  readonly distanceMeters: number
  readonly headingDegrees: number
}

const DEFAULT_MATCHING_OPTIONS: LiveBusRouteMatchingOptions = {
  maximumSpeedMetersPerSecond: DEFAULT_MAXIMUM_SPEED_METERS_PER_SECOND,
  gpsMovementToleranceMeters: DEFAULT_GPS_MOVEMENT_TOLERANCE_METERS,
  branchDistanceToleranceMeters: DEFAULT_BRANCH_DISTANCE_TOLERANCE_METERS,
  headingPreferenceWeight: DEFAULT_HEADING_PREFERENCE_WEIGHT,
  continuityHorizonMs: DEFAULT_CONTINUITY_HORIZON_MS,
}

function segmentLengthMeters(
  first: TransitGeoJsonPosition,
  second: TransitGeoJsonPosition,
): number {
  const middleLatitudeRadians = (first[1] + second[1]) * Math.PI / 360
  const longitudeDistance = (second[0] - first[0]) * METERS_PER_DEGREE * Math.cos(middleLatitudeRadians)
  const latitudeDistance = (second[1] - first[1]) * METERS_PER_DEGREE
  return Math.hypot(longitudeDistance, latitudeDistance)
}

function routeLengthMeters(coordinates: readonly TransitGeoJsonPosition[]): number {
  let distance = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += segmentLengthMeters(coordinates[index - 1], coordinates[index])
  }
  return distance
}

export function isClosedRoute(coordinates: readonly TransitGeoJsonPosition[]): boolean {
  return coordinates.length > 2 && segmentLengthMeters(
    coordinates[0],
    coordinates[coordinates.length - 1],
  ) < 1
}

function wrapProgress(progressMeters: number, lengthMeters: number): number {
  const wrapped = progressMeters % lengthMeters
  return wrapped < 0 ? wrapped + lengthMeters : wrapped
}

function coordinateAtProgress(
  coordinates: readonly TransitGeoJsonPosition[],
  progressMeters: number,
): readonly [number, number] {
  let remaining = progressMeters
  for (let index = 1; index < coordinates.length; index += 1) {
    const first = coordinates[index - 1]
    const second = coordinates[index]
    const length = segmentLengthMeters(first, second)
    if (remaining <= length || index === coordinates.length - 1) {
      const fraction = length === 0 ? 0 : Math.max(0, Math.min(1, remaining / length))
      return [
        first[0] + (second[0] - first[0]) * fraction,
        first[1] + (second[1] - first[1]) * fraction,
      ]
    }
    remaining -= length
  }
  const last = coordinates[coordinates.length - 1]
  return [last[0], last[1]]
}

function routeCandidates(
  coordinate: readonly [number, number],
  routeCoordinates: readonly TransitGeoJsonPosition[],
): RouteCandidate[] {
  if (
    routeCoordinates.length < 2 ||
    !Number.isFinite(coordinate[0]) ||
    !Number.isFinite(coordinate[1])
  ) return []

  const candidates: RouteCandidate[] = []
  let cumulativeDistance = 0

  for (let index = 1; index < routeCoordinates.length; index += 1) {
    const first = routeCoordinates[index - 1]
    const second = routeCoordinates[index]
    const middleLatitudeRadians = (first[1] + second[1]) * Math.PI / 360
    const longitudeScale = METERS_PER_DEGREE * Math.cos(middleLatitudeRadians)
    const segmentX = (second[0] - first[0]) * longitudeScale
    const segmentY = (second[1] - first[1]) * METERS_PER_DEGREE
    const pointX = (coordinate[0] - first[0]) * longitudeScale
    const pointY = (coordinate[1] - first[1]) * METERS_PER_DEGREE
    const lengthSquared = segmentX * segmentX + segmentY * segmentY
    const segmentLength = Math.sqrt(lengthSquared)

    if (segmentLength === 0) continue

    const fraction = Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared))
    const offsetX = pointX - segmentX * fraction
    const offsetY = pointY - segmentY * fraction
    const bearing = (Math.atan2(segmentX, segmentY) * 180 / Math.PI + 360) % 360
    candidates.push({
      coordinate: [
        first[0] + (second[0] - first[0]) * fraction,
        first[1] + (second[1] - first[1]) * fraction,
      ],
      progressMeters: cumulativeDistance + segmentLength * fraction,
      distanceMeters: Math.hypot(offsetX, offsetY),
      headingDegrees: bearing,
    })
    cumulativeDistance += segmentLength
  }

  return candidates
}

function headingDifference(first: number, second: number): number {
  const difference = Math.abs(((first - second) % 360 + 360) % 360)
  return Math.min(difference, 360 - difference)
}

function progressDifferences(
  fromProgressMeters: number,
  toProgressMeters: number,
  routeCoordinates: readonly TransitGeoJsonPosition[],
): readonly number[] {
  const difference = toProgressMeters - fromProgressMeters
  if (!isClosedRoute(routeCoordinates)) return [difference]

  const length = routeLengthMeters(routeCoordinates)
  if (length === 0) return [difference]
  const forwardDifference = wrapProgress(difference, length)
  const reverseDifference = forwardDifference - length
  return [forwardDifference, reverseDifference]
}

export function snapToRoute(
  coordinate: readonly [number, number],
  routeCoordinates: readonly TransitGeoJsonPosition[],
): RoutePosition | null {
  const candidates = routeCandidates(coordinate, routeCoordinates)
  return candidates.reduce<RouteCandidate | null>(
    (closest, candidate) => !closest || candidate.distanceMeters < closest.distanceMeters
      ? candidate
      : closest,
    null,
  )
}

export function matchVehicleRoutePosition(
  coordinate: readonly [number, number],
  headingDegrees: number | null | undefined,
  routeCoordinates: readonly TransitGeoJsonPosition[],
  baseline: RoutePositionBaseline | null,
  observedAtMs: number,
  options: LiveBusRouteMatchingOptions = DEFAULT_MATCHING_OPTIONS,
): VehicleRoutePositionMatch {
  const candidates = routeCandidates(coordinate, routeCoordinates)
  if (candidates.length === 0) return { kind: 'rejected' }
  const usableHeadingDegrees = typeof headingDegrees === 'number' && Number.isFinite(headingDegrees)
    ? headingDegrees
    : null

  const nearest = candidates.reduce((closest, candidate) =>
    candidate.distanceMeters < closest.distanceMeters ? candidate : closest,
  )
  if (!baseline) {
    const initialCandidates = candidates.filter((candidate) =>
      candidate.distanceMeters <= nearest.distanceMeters + options.branchDistanceToleranceMeters,
    )
    const scoreInitialCandidate = (candidate: RouteCandidate): number => (
      (candidate.distanceMeters - nearest.distanceMeters) * 2 +
      (usableHeadingDegrees === null
        ? 0
        : headingDifference(usableHeadingDegrees, candidate.headingDegrees) * options.headingPreferenceWeight)
    )
    const position = initialCandidates.reduce((best, candidate) =>
      scoreInitialCandidate(candidate) < scoreInitialCandidate(best) ? candidate : best,
    )
    return { kind: 'matched', continuity: 'initial', position, progressDeltaMeters: null }
  }

  const elapsedMs = observedAtMs - baseline.observedAtMs
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return { kind: 'rejected' }
  if (elapsedMs > options.continuityHorizonMs) {
    return { kind: 'matched', continuity: 'reacquired', position: nearest, progressDeltaMeters: null }
  }

  const nearestDistance = nearest.distanceMeters
  const maximumMovementMeters = options.maximumSpeedMetersPerSecond * elapsedMs / 1000 +
    options.gpsMovementToleranceMeters
  const plausibleCandidates = candidates.filter((candidate) =>
    candidate.distanceMeters <= nearestDistance + options.branchDistanceToleranceMeters,
  )
  let best: RouteCandidate | null = null
  let bestProgressDeltaMeters: number | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of plausibleCandidates) {
    const movements = progressDifferences(
      baseline.progressMeters,
      candidate.progressMeters,
      routeCoordinates,
    )

    for (const movement of movements) {
      const movementMeters = Math.abs(movement)
      if (movementMeters > maximumMovementMeters) continue

      const travelHeading = (candidate.headingDegrees + (movement < 0 ? 180 : 0)) % 360
      const headingError = usableHeadingDegrees === null
        ? 0
        : headingDifference(usableHeadingDegrees, travelHeading)
      const score = movementMeters + (candidate.distanceMeters - nearestDistance) * 2 +
        headingError * options.headingPreferenceWeight
      if (score < bestScore) {
        bestScore = score
        best = candidate
        bestProgressDeltaMeters = movement
      }
    }
  }

  return best
    ? {
      kind: 'matched',
      continuity: 'continuous',
      position: best,
      progressDeltaMeters: bestProgressDeltaMeters ?? 0,
    }
    : { kind: 'rejected' }
}

export function interpolateRoutePosition(
  routeCoordinates: readonly TransitGeoJsonPosition[],
  fromProgressMeters: number,
  toProgressMeters: number,
  progress: number,
  preferredProgressDeltaMeters?: number,
): RoutePosition | null {
  if (routeCoordinates.length < 2) return null
  const lengthMeters = routeLengthMeters(routeCoordinates)
  if (lengthMeters === 0) return null

  const closedRoute = isClosedRoute(routeCoordinates)
  const from = closedRoute ? wrapProgress(fromProgressMeters, lengthMeters) : fromProgressMeters
  let to = closedRoute ? wrapProgress(toProgressMeters, lengthMeters) : toProgressMeters
  if (closedRoute) {
    if (preferredProgressDeltaMeters !== undefined) {
      const forwardDifference = wrapProgress(to - from, lengthMeters)
      const directedDifference = preferredProgressDeltaMeters === 0
        ? 0
        : preferredProgressDeltaMeters < 0
          ? forwardDifference - lengthMeters
          : forwardDifference
      to = from + directedDifference
    } else {
      const difference = to - from
      if (difference > lengthMeters / 2) to -= lengthMeters
      if (difference < -lengthMeters / 2) to += lengthMeters
    }
  }
  const ratio = Math.max(0, Math.min(1, progress))
  const interpolated = from + (to - from) * ratio
  const normalized = closedRoute
    ? wrapProgress(interpolated, lengthMeters)
    : Math.max(0, Math.min(lengthMeters, interpolated))

  return {
    coordinate: coordinateAtProgress(routeCoordinates, normalized),
    progressMeters: normalized,
  }
}

import type { TransitGeoJsonPosition } from '@nusgo/shared/transit/types'

const EARTH_RADIUS_METERS = 6_371_008.8
const METERS_PER_DEGREE = Math.PI * EARTH_RADIUS_METERS / 180

export interface RoutePosition {
  readonly coordinate: readonly [number, number]
  readonly progressMeters: number
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

export function snapToRoute(
  coordinate: readonly [number, number],
  routeCoordinates: readonly TransitGeoJsonPosition[],
): RoutePosition | null {
  if (
    routeCoordinates.length < 2 ||
    !Number.isFinite(coordinate[0]) ||
    !Number.isFinite(coordinate[1])
  ) return null

  let cumulativeDistance = 0
  let closestDistance = Number.POSITIVE_INFINITY
  let closest: RoutePosition | null = null

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
    const fraction = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared))
    const offsetX = pointX - segmentX * fraction
    const offsetY = pointY - segmentY * fraction
    const distance = Math.hypot(offsetX, offsetY)

    if (distance < closestDistance) {
      const segmentLength = Math.sqrt(lengthSquared)
      closestDistance = distance
      closest = {
        coordinate: [
          first[0] + (second[0] - first[0]) * fraction,
          first[1] + (second[1] - first[1]) * fraction,
        ],
        progressMeters: cumulativeDistance + segmentLength * fraction,
      }
    }
    cumulativeDistance += Math.sqrt(lengthSquared)
  }

  return closest
}

export function interpolateRoutePosition(
  routeCoordinates: readonly TransitGeoJsonPosition[],
  fromProgressMeters: number,
  toProgressMeters: number,
  progress: number,
): RoutePosition | null {
  if (routeCoordinates.length < 2) return null
  const lengthMeters = routeLengthMeters(routeCoordinates)
  if (lengthMeters === 0) return null

  const closedRoute = isClosedRoute(routeCoordinates)
  const from = closedRoute ? wrapProgress(fromProgressMeters, lengthMeters) : fromProgressMeters
  let to = closedRoute ? wrapProgress(toProgressMeters, lengthMeters) : toProgressMeters
  if (closedRoute) {
    const difference = to - from
    if (difference > lengthMeters / 2) to -= lengthMeters
    if (difference < -lengthMeters / 2) to += lengthMeters
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

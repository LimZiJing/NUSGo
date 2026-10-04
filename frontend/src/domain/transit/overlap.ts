import type {
  TransitGeoJsonPosition,
  TransitRouteGeometry,
} from './types'

const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320
const OVERLAP_TOLERANCE_METRES = 15
const POSITION_EPSILON_METRES = 0.001
const MINIMUM_OVERLAP_LENGTH_METRES = 20

interface LocalPoint {
  x: number
  y: number
}

interface OverlapInterval {
  start: number
  end: number
}

function toLocalPoint(
  position: TransitGeoJsonPosition,
  referenceLatitude: number,
): LocalPoint {
  const longitudeScale = METRES_PER_LONGITUDE_DEGREE * Math.cos(referenceLatitude * Math.PI / 180)
  return {
    x: position[0] * longitudeScale,
    y: position[1] * METRES_PER_LATITUDE_DEGREE,
  }
}

function subtract(first: LocalPoint, second: LocalPoint): LocalPoint {
  return { x: first.x - second.x, y: first.y - second.y }
}

function dot(first: LocalPoint, second: LocalPoint): number {
  return first.x * second.x + first.y * second.y
}

function length(vector: LocalPoint): number {
  return Math.hypot(vector.x, vector.y)
}

function distanceBetween(first: LocalPoint, second: LocalPoint): number {
  return length(subtract(first, second))
}

function projectParameter(point: LocalPoint, start: LocalPoint, end: LocalPoint): number {
  const direction = subtract(end, start)
  const directionLengthSquared = dot(direction, direction)
  if (directionLengthSquared === 0) return 0
  return dot(subtract(point, start), direction) / directionLengthSquared
}

function distanceToSegment(
  point: LocalPoint,
  start: LocalPoint,
  end: LocalPoint,
): number {
  const parameter = Math.max(0, Math.min(1, projectParameter(point, start, end)))
  const direction = subtract(end, start)
  const closest = {
    x: start.x + parameter * direction.x,
    y: start.y + parameter * direction.y,
  }
  return distanceBetween(point, closest)
}

function getSegmentOverlapInterval(
  firstStartPosition: TransitGeoJsonPosition,
  firstEndPosition: TransitGeoJsonPosition,
  secondStartPosition: TransitGeoJsonPosition,
  secondEndPosition: TransitGeoJsonPosition,
): OverlapInterval | null {
  const referenceLatitude = (
    firstStartPosition[1] + firstEndPosition[1] +
    secondStartPosition[1] + secondEndPosition[1]
  ) / 4
  const firstStart = toLocalPoint(firstStartPosition, referenceLatitude)
  const firstEnd = toLocalPoint(firstEndPosition, referenceLatitude)
  const secondStart = toLocalPoint(secondStartPosition, referenceLatitude)
  const secondEnd = toLocalPoint(secondEndPosition, referenceLatitude)
  const firstDirection = subtract(firstEnd, firstStart)
  const secondDirection = subtract(secondEnd, secondStart)
  const firstLength = length(firstDirection)
  const secondLength = length(secondDirection)
  if (firstLength === 0 || secondLength === 0) return null

  const firstUnit = { x: firstDirection.x / firstLength, y: firstDirection.y / firstLength }
  const secondStartProjection = dot(subtract(secondStart, firstStart), firstUnit)
  const secondEndProjection = dot(subtract(secondEnd, firstStart), firstUnit)
  const start = Math.max(0, Math.min(secondStartProjection, secondEndProjection))
  const end = Math.min(firstLength, Math.max(secondStartProjection, secondEndProjection))
  if (end <= start) return null

  const overlapStart = {
    x: firstStart.x + firstUnit.x * start,
    y: firstStart.y + firstUnit.y * start,
  }
  const overlapEnd = {
    x: firstStart.x + firstUnit.x * end,
    y: firstStart.y + firstUnit.y * end,
  }
  if (distanceToSegment(overlapStart, secondStart, secondEnd) > OVERLAP_TOLERANCE_METRES) return null
  if (distanceToSegment(overlapEnd, secondStart, secondEnd) > OVERLAP_TOLERANCE_METRES) return null
  return { start, end }
}

function hasMeaningfulOverlap(
  firstLine: TransitGeoJsonPosition[],
  secondLine: TransitGeoJsonPosition[],
): boolean {
  const intervals: OverlapInterval[] = []
  let firstLineDistance = 0

  for (let firstIndex = 1; firstIndex < firstLine.length; firstIndex += 1) {
    const firstStart = firstLine[firstIndex - 1]
    const firstEnd = firstLine[firstIndex]
    const firstSegmentDistance = getDistanceInMetres(firstStart, firstEnd)

    for (let secondIndex = 1; secondIndex < secondLine.length; secondIndex += 1) {
      const interval = getSegmentOverlapInterval(
        firstStart,
        firstEnd,
        secondLine[secondIndex - 1],
        secondLine[secondIndex],
      )
      if (interval) {
        intervals.push({
          start: firstLineDistance + interval.start,
          end: firstLineDistance + interval.end,
        })
      }
    }

    firstLineDistance += firstSegmentDistance
  }

  intervals.sort((first, second) => first.start - second.start)
  let mergedStart = intervals[0]?.start
  let mergedEnd = intervals[0]?.end
  for (const interval of intervals.slice(1)) {
    if (mergedEnd !== undefined && interval.start <= mergedEnd + POSITION_EPSILON_METRES) {
      mergedEnd = Math.max(mergedEnd, interval.end)
      if (mergedEnd - (mergedStart ?? mergedEnd) >= MINIMUM_OVERLAP_LENGTH_METRES) return true
      continue
    }
    if (
      mergedStart !== undefined &&
      mergedEnd !== undefined &&
      mergedEnd - mergedStart >= MINIMUM_OVERLAP_LENGTH_METRES
    ) {
      return true
    }
    mergedStart = interval.start
    mergedEnd = interval.end
  }

  return (
    mergedStart !== undefined &&
    mergedEnd !== undefined &&
    mergedEnd - mergedStart >= MINIMUM_OVERLAP_LENGTH_METRES
  )
}

function getDistanceInMetres(
  first: TransitGeoJsonPosition,
  second: TransitGeoJsonPosition,
): number {
  const referenceLatitude = (first[1] + second[1]) / 2
  return distanceBetween(
    toLocalPoint(first, referenceLatitude),
    toLocalPoint(second, referenceLatitude),
  )
}

export type TransitRouteOverlapMap = ReadonlyMap<string, ReadonlySet<string>>

export function deriveTransitRouteOverlapMap(
  geometry: TransitRouteGeometry,
): TransitRouteOverlapMap {
  const overlaps = new Map<string, Set<string>>()

  for (let firstIndex = 0; firstIndex < geometry.features.length; firstIndex += 1) {
    const firstFeature = geometry.features[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < geometry.features.length; secondIndex += 1) {
      const secondFeature = geometry.features[secondIndex]
      if (!hasMeaningfulOverlap(firstFeature.geometry.coordinates, secondFeature.geometry.coordinates)) continue

      const firstOverlaps = overlaps.get(firstFeature.properties.routeId) ?? new Set<string>()
      firstOverlaps.add(secondFeature.properties.routeId)
      overlaps.set(firstFeature.properties.routeId, firstOverlaps)

      const secondOverlaps = overlaps.get(secondFeature.properties.routeId) ?? new Set<string>()
      secondOverlaps.add(firstFeature.properties.routeId)
      overlaps.set(secondFeature.properties.routeId, secondOverlaps)
    }
  }

  return new Map(
    Array.from(overlaps.entries())
      .sort(([firstRouteId], [secondRouteId]) => firstRouteId.localeCompare(secondRouteId))
      .map(([routeId, routeOverlaps]) => [
        routeId,
        new Set(Array.from(routeOverlaps).sort((first, second) => first.localeCompare(second))),
      ]),
  )
}

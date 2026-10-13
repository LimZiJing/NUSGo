import type {
  TransitGeoJsonPosition,
  TransitNetwork,
  BusRouteGeometry,
} from './types.ts'
import { TransitValidationError } from './model.ts'

const MAX_STOP_DISTANCE_METRES = 50
const METRES_PER_LATITUDE_DEGREE = 110540
const METRES_PER_LONGITUDE_DEGREE = 111320

interface ProjectedPosition {
  distance: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === undefined) return 'missing'
  if (typeof value === 'string') return value
  return String(value)
}

function featureRouteId(value: Record<string, unknown>, index: number): string {
  const properties = isRecord(value.properties) ? value.properties : null
  return properties && typeof properties.routeId === 'string' && properties.routeId.trim().length > 0
    ? properties.routeId
    : `<index ${index}>`
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

function projectOntoLine(
  point: TransitGeoJsonPosition,
  line: TransitGeoJsonPosition[],
): ProjectedPosition {
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1]
    const end = line[index]
    const startMeters = toLocalMeters(start, point[1])
    const endMeters = toLocalMeters(end, point[1])
    const pointMeters = toLocalMeters(point, point[1])
    const deltaX = endMeters[0] - startMeters[0]
    const deltaY = endMeters[1] - startMeters[1]
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY
    const ratio = segmentLengthSquared === 0
      ? 0
      : Math.max(
        0,
        Math.min(
          1,
          ((pointMeters[0] - startMeters[0]) * deltaX +
            (pointMeters[1] - startMeters[1]) * deltaY) / segmentLengthSquared,
        ),
      )
    const projectedX = startMeters[0] + ratio * deltaX
    const projectedY = startMeters[1] + ratio * deltaY
    const candidateDistance = Math.hypot(
      pointMeters[0] - projectedX,
      pointMeters[1] - projectedY,
    )
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance
    }
  }

  return { distance: bestDistance }
}

function readLineCoordinates(
  value: unknown,
  routeId: string,
  issues: string[],
): TransitGeoJsonPosition[] | null {
  if (!Array.isArray(value)) {
    issues.push(`Transit route ${routeId} geometry coordinates must be an array`)
    return null
  }
  if (value.length < 2) {
    issues.push(`Transit route ${routeId} geometry coordinates must contain at least two positions`)
    return null
  }

  const coordinates: TransitGeoJsonPosition[] = []
  for (const [index, position] of value.entries()) {
    if (!Array.isArray(position) || position.length !== 2) {
      issues.push(`Transit route ${routeId} geometry coordinate ${index} must be [longitude, latitude]`)
      continue
    }
    const longitude = position[0]
    const latitude = position[1]
    if (
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      issues.push(
        `Transit route ${routeId} geometry coordinate ${index} is invalid: [${describe(longitude)}, ${describe(latitude)}]`,
      )
      continue
    }
    coordinates.push([longitude, latitude])
  }

  return coordinates.length === value.length ? coordinates : null
}

export function validateBusRouteGeometry(
  network: TransitNetwork,
  input: unknown,
): BusRouteGeometry {
  const issues: string[] = []
  if (!isRecord(input)) {
    throw new TransitValidationError(['Transit route geometry must be an object'])
  }
  if (input.type !== 'FeatureCollection') {
    issues.push(`Transit route geometry type must be FeatureCollection: ${describe(input.type)}`)
  }
  if (!Array.isArray(input.features)) {
    issues.push('Transit route geometry features must be an array')
    throw new TransitValidationError(issues)
  }
  if (input.features.length !== network.routes.length) {
    issues.push(
      `Transit route geometry must contain one feature per route: expected ${network.routes.length}, found ${input.features.length}`,
    )
  }

  const networkRoutes = new Map(network.routes.map((route) => [route.id, route]))
  const networkStops = new Map(network.stops.map((stop) => [stop.id, stop]))
  const seenRouteIds = new Set<string>()
  const linesByRoute = new Map<string, TransitGeoJsonPosition[]>()

  for (const [index, value] of input.features.entries()) {
    if (!isRecord(value)) {
      issues.push(`Transit route geometry feature at index ${index} must be an object`)
      continue
    }
    if (value.type !== 'Feature') {
      issues.push(`Transit route geometry feature at index ${index} must have type Feature`)
    }

    const properties = value.properties
    if (!isRecord(properties)) {
      issues.push(`Transit route geometry feature at index ${index} properties must be an object`)
      continue
    }
    const routeId = featureRouteId(value, index)
    const route = networkRoutes.get(routeId)
    if (typeof properties.routeId !== 'string' || properties.routeId.trim().length === 0) {
      issues.push(`Transit route geometry feature ${routeId} must have a non-empty route ID`)
    } else if (!route) {
      issues.push(`Transit route geometry references unknown route: ${routeId}`)
    } else {
      if (seenRouteIds.has(routeId)) {
        issues.push(`Duplicate transit route geometry feature for route: ${routeId}`)
      }
      seenRouteIds.add(routeId)
      if (typeof properties.name !== 'string' || properties.name.trim().length === 0) {
        issues.push(`Transit route geometry ${routeId} name must be a non-empty string`)
      } else if (properties.name !== route.name) {
        issues.push(`Transit route geometry ${routeId} name does not match the network model`)
      }
      if (typeof properties.color !== 'string' || properties.color.trim().length === 0) {
        issues.push(`Transit route geometry ${routeId} color must be a non-empty string`)
      } else if (properties.color !== route.color) {
        issues.push(`Transit route geometry ${routeId} color does not match the network model`)
      }
    }

    const geometry = value.geometry
    if (!isRecord(geometry)) {
      issues.push(`Transit route geometry ${routeId} must contain a geometry object`)
      continue
    }
    if (geometry.type !== 'LineString') {
      issues.push(`Transit route geometry ${routeId} must be a LineString: ${describe(geometry.type)}`)
      continue
    }
    const coordinates = readLineCoordinates(geometry.coordinates, routeId, issues)
    if (coordinates && route && !linesByRoute.has(routeId)) {
      linesByRoute.set(routeId, coordinates)
    }
  }

  for (const route of network.routes) {
    if (!seenRouteIds.has(route.id)) {
      issues.push(`Transit route geometry is missing route: ${route.id}`)
      continue
    }
    const line = linesByRoute.get(route.id)
    if (!line) continue

    const routeStops = route.stopIds.map((stopId) => networkStops.get(stopId))
    const firstStop = routeStops[0]
    const lastStop = routeStops.at(-1)
    if (!firstStop || !lastStop) continue
    const firstPosition: TransitGeoJsonPosition = [firstStop.longitude, firstStop.latitude]
    const lastPosition: TransitGeoJsonPosition = [lastStop.longitude, lastStop.latitude]
    if (distanceBetween(firstPosition, line[0]) > MAX_STOP_DISTANCE_METRES) {
      issues.push(`Transit route ${route.id} geometry start is not within 50 metres of stop ${firstStop.id}`)
    }
    if (distanceBetween(lastPosition, line.at(-1)!) > MAX_STOP_DISTANCE_METRES) {
      issues.push(`Transit route ${route.id} geometry end is not within 50 metres of stop ${lastStop.id}`)
    }

    for (const stop of routeStops) {
      if (!stop) continue
      const position: TransitGeoJsonPosition = [stop.longitude, stop.latitude]
      const projected = projectOntoLine(position, line)
      if (projected.distance > MAX_STOP_DISTANCE_METRES) {
        issues.push(
          `Transit route ${route.id} stop ${stop.id} is ${projected.distance.toFixed(1)} metres from route geometry (maximum 50)`,
        )
      }
    }
  }

  if (issues.length > 0) throw new TransitValidationError(issues)
  return input as unknown as BusRouteGeometry
}

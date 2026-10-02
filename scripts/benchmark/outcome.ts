import type { LoadedTransitData } from '../../src/app/contracts/data.js'
import type { Journey, JourneyLineString } from '../../src/domain/trip/journey.js'
import type { TripEndpoint } from '../../src/domain/trip/types.js'
import type { VenueLocationMap } from '../../src/domain/venue/types.js'
import type {
  JourneyBenchmarkCase,
} from './contract.js'

export interface JourneyBenchmarkValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly result: Readonly<Record<string, unknown>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

function endpointKey(endpoint: TripEndpoint): string {
  return `${endpoint.kind}:${endpoint.id}`
}

function isEndpoint(value: unknown): value is TripEndpoint {
  return isRecord(value) &&
    (value.kind === 'venue' || value.kind === 'stop') &&
    typeof value.id === 'string' &&
    value.id.length > 0
}

function isLineString(value: unknown): value is JourneyLineString {
  return isRecord(value) &&
    value.type === 'LineString' &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length >= 2 &&
    value.coordinates.every((coordinate) => (
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      typeof coordinate[0] === 'number' &&
      Number.isFinite(coordinate[0]) &&
      coordinate[0] >= -180 &&
      coordinate[0] <= 180 &&
      typeof coordinate[1] === 'number' &&
      Number.isFinite(coordinate[1]) &&
      coordinate[1] >= -90 &&
      coordinate[1] <= 90
  ))
}

function endpointCoordinate(
  endpoint: TripEndpoint,
  transit: LoadedTransitData,
  venues: VenueLocationMap,
): readonly [number, number] | null {
  if (endpoint.kind === 'stop') {
    const stop = transit.index.stopById.get(endpoint.id)
    return stop && Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
      ? [stop.longitude, stop.latitude]
      : null
  }
  const location = venues[endpoint.id]?.location
  return location && Number.isFinite(location.x) && Number.isFinite(location.y)
    ? [location.x, location.y]
    : null
}

function distanceMeters(
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  const referenceLatitude = (first[1] + second[1]) / 2
  const longitudeScale = 111320 * Math.cos(referenceLatitude * Math.PI / 180)
  return Math.hypot(
    (first[0] - second[0]) * longitudeScale,
    (first[1] - second[1]) * 110540,
  )
}

function validateLegGeometry(
  value: unknown,
  from: TripEndpoint,
  to: TripEndpoint,
  mode: unknown,
  transit: LoadedTransitData,
  venues: VenueLocationMap,
  label: string,
  errors: string[],
): void {
  if (!isLineString(value)) {
    errors.push(`${label} geometry must be a valid LineString`)
    return
  }
  const fromCoordinate = endpointCoordinate(from, transit, venues)
  const toCoordinate = endpointCoordinate(to, transit, venues)
  if (!fromCoordinate || !toCoordinate) {
    errors.push(`${label} geometry endpoints cannot be checked against fixture coordinates`)
    return
  }
  const firstCoordinate = value.coordinates[0]
  const lastCoordinate = value.coordinates.at(-1)
  if (!firstCoordinate || !lastCoordinate) {
    errors.push(`${label} geometry must have start and end coordinates`)
    return
  }
  const toleranceMeters = mode === 'shuttle' ? 75 : 250
  if (distanceMeters(fromCoordinate, firstCoordinate) > toleranceMeters) {
    errors.push(`${label} geometry does not start near its from endpoint`)
  }
  if (distanceMeters(toCoordinate, lastCoordinate) > toleranceMeters) {
    errors.push(`${label} geometry does not end near its to endpoint`)
  }
}

function validateEndpointReference(
  endpoint: TripEndpoint,
  transit: LoadedTransitData,
  venues: VenueLocationMap,
  label: string,
  errors: string[],
): void {
  if (endpoint.kind === 'stop' && !transit.index.stopById.has(endpoint.id)) {
    errors.push(`${label} references unknown stop ${endpoint.id}`)
  } else if (endpoint.kind === 'venue' && !venues[endpoint.id]) {
    errors.push(`${label} references unknown venue ${endpoint.id}`)
  }
}

function validateJourney(
  value: unknown,
  benchmarkCase: JourneyBenchmarkCase,
  transit: LoadedTransitData,
  venues: VenueLocationMap,
  errors: string[],
): Journey | null {
  if (!isRecord(value)) {
    errors.push('journey must be an object')
    return null
  }

  if (!isEndpoint(value.origin)) errors.push('journey origin must be a valid endpoint')
  if (!isEndpoint(value.destination)) errors.push('journey destination must be a valid endpoint')
  if (isEndpoint(value.origin) && endpointKey(value.origin) !== endpointKey(benchmarkCase.origin)) {
    errors.push('journey origin does not match the benchmark case')
  }
  if (isEndpoint(value.destination) && endpointKey(value.destination) !== endpointKey(benchmarkCase.destination)) {
    errors.push('journey destination does not match the benchmark case')
  }
  if (value.estimateStatus !== 'estimated') errors.push('journey estimateStatus must be estimated')
  if (value.planningQuality !== 'exact' && value.planningQuality !== 'bounded') {
    errors.push('journey planningQuality must be exact or bounded')
  }
  if (!Array.isArray(value.legs) || value.legs.length === 0) {
    errors.push('journey must contain at least one leg')
    return null
  }

  let expectedFrom = benchmarkCase.origin
  let durationTotal = 0
  let distanceTotal = 0
  let shuttleBoardings = 0
  const modes: string[] = []
  const routeIds: string[] = []
  value.legs.forEach((legValue, index) => {
    if (!isRecord(legValue)) {
      errors.push(`leg ${index + 1} must be an object`)
      return
    }
    const from = legValue.from
    const to = legValue.to
    if (!isEndpoint(from) || !isEndpoint(to)) {
      errors.push(`leg ${index + 1} endpoints must be valid trip endpoints`)
      return
    }
    validateEndpointReference(from, transit, venues, `leg ${index + 1} from`, errors)
    validateEndpointReference(to, transit, venues, `leg ${index + 1} to`, errors)
    if (endpointKey(from) !== endpointKey(expectedFrom)) {
      errors.push(`leg ${index + 1} does not continue from the previous endpoint`)
    }
    expectedFrom = to
    if (!isNonNegativeInteger(legValue.durationSeconds)) {
      errors.push(`leg ${index + 1} durationSeconds must be a non-negative integer`)
    } else durationTotal += legValue.durationSeconds
    if (!isNonNegativeInteger(legValue.distanceMeters)) {
      errors.push(`leg ${index + 1} distanceMeters must be a non-negative integer`)
    } else distanceTotal += legValue.distanceMeters
    validateLegGeometry(
      legValue.geometry,
      from,
      to,
      legValue.mode,
      transit,
      venues,
      `leg ${index + 1}`,
      errors,
    )

    if (legValue.mode === 'walking') {
      modes.push('walking')
      return
    }
    if (legValue.mode !== 'shuttle') {
      errors.push(`leg ${index + 1} mode must be walking or shuttle`)
      return
    }

    modes.push('shuttle')
    shuttleBoardings += 1
    if (from.kind !== 'stop' || to.kind !== 'stop') {
      errors.push(`shuttle leg ${index + 1} must connect shuttle stops`)
      return
    }
    const routeId = legValue.routeId
    const route = typeof routeId === 'string' ? transit.index.routeById.get(routeId) : undefined
    if (!route) {
      errors.push(`shuttle leg ${index + 1} references an unknown route`)
      return
    }
    routeIds.push(route.id)
    const fromIndex = route.stopIds.indexOf(from.id)
    const toIndex = route.stopIds.indexOf(to.id)
    if (fromIndex < 0 || toIndex <= fromIndex) {
      errors.push(`shuttle leg ${index + 1} does not follow route ${route.id} stop order`)
    }
    if (legValue.boardingStopId !== from.id || legValue.alightingStopId !== to.id) {
      errors.push(`shuttle leg ${index + 1} boarding/alighting IDs must match its endpoints`)
    }
    if (!isNonNegativeInteger(legValue.waitingSeconds) || !isNonNegativeInteger(legValue.rideSeconds)) {
      errors.push(`shuttle leg ${index + 1} waiting and ride seconds must be non-negative integers`)
    } else if (legValue.durationSeconds !== legValue.waitingSeconds + legValue.rideSeconds) {
      errors.push(`shuttle leg ${index + 1} duration must equal waiting plus ride time`)
    }
  })

  if (endpointKey(expectedFrom) !== endpointKey(benchmarkCase.destination)) {
    errors.push('journey legs do not end at the benchmark destination')
  }
  if (!isNonNegativeInteger(value.totalDurationSeconds) || value.totalDurationSeconds !== durationTotal) {
    errors.push('journey totalDurationSeconds must equal the sum of its leg durations')
  }
  if (!isNonNegativeInteger(value.totalDistanceMeters) || value.totalDistanceMeters !== distanceTotal) {
    errors.push('journey totalDistanceMeters must equal the sum of its leg distances')
  }
  if (benchmarkCase.expected.shuttleBoardings !== undefined && shuttleBoardings !== benchmarkCase.expected.shuttleBoardings) {
    errors.push(`expected ${benchmarkCase.expected.shuttleBoardings} shuttle boardings; got ${shuttleBoardings}`)
  }
  if (benchmarkCase.expected.modes && JSON.stringify(modes) !== JSON.stringify(benchmarkCase.expected.modes)) {
    errors.push(`expected modes ${benchmarkCase.expected.modes.join(', ')}; got ${modes.join(', ')}`)
  }
  if (benchmarkCase.expected.routeIds && JSON.stringify(routeIds) !== JSON.stringify(benchmarkCase.expected.routeIds)) {
    errors.push(`expected routes ${benchmarkCase.expected.routeIds.join(', ')}; got ${routeIds.join(', ')}`)
  }
  const bounds = benchmarkCase.durationBoundsSeconds
  if (isNonNegativeInteger(value.totalDurationSeconds)) {
    if (bounds?.min !== undefined && value.totalDurationSeconds < bounds.min) {
      errors.push(`journey totalDurationSeconds is below the minimum ${bounds.min}`)
    }
    if (bounds?.max !== undefined && value.totalDurationSeconds > bounds.max) {
      errors.push(`journey totalDurationSeconds exceeds the maximum ${bounds.max}`)
    }
  }

  return value as unknown as Journey
}

export function validateJourneyBenchmarkOutcome(
  input: unknown,
  benchmarkCase: JourneyBenchmarkCase,
  transit: LoadedTransitData,
  venues: VenueLocationMap,
): JourneyBenchmarkValidation {
  const errors: string[] = []
  let result: Readonly<Record<string, unknown>> = { kind: 'invalid' }

  if (!isRecord(input)) {
    errors.push('benchmark outcome must be an object')
  } else if (input.kind === 'no-route') {
    if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
      errors.push('no-route outcome must include a reason')
    }
    if (benchmarkCase.expected.outcome !== 'no-route') {
      errors.push(`expected ${benchmarkCase.expected.outcome}; got no-route`)
    }
    result = { kind: 'no-route', reason: typeof input.reason === 'string' ? input.reason : '' }
  } else if (input.kind === 'journey') {
    if (benchmarkCase.expected.outcome !== 'journey') errors.push('expected no-route; got journey')
    const journey = validateJourney(input.journey, benchmarkCase, transit, venues, errors)
    if (journey) {
      result = {
        kind: 'journey',
        modes: journey.legs.map((leg) => leg.mode),
        shuttleBoardings: journey.legs.filter((leg) => leg.mode === 'shuttle').length,
        routeIds: journey.legs.flatMap((leg) => leg.mode === 'shuttle' ? [leg.routeId] : []),
        waitingSeconds: journey.legs.reduce((sum, leg) => sum + (leg.mode === 'shuttle' ? leg.waitingSeconds : 0), 0),
        rideSeconds: journey.legs.reduce((sum, leg) => sum + (leg.mode === 'shuttle' ? leg.rideSeconds : 0), 0),
        totalDurationSeconds: journey.totalDurationSeconds,
        totalDistanceMeters: journey.totalDistanceMeters,
        planningQuality: journey.planningQuality,
      }
    }
  } else {
    errors.push('benchmark outcome kind must be journey or no-route')
  }

  return { valid: errors.length === 0, errors, result }
}

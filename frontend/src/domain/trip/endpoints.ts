import type {
  TripCoordinate,
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from './types'
import { isValidLocationCoordinates } from '../location/coordinates'

export function createCurrentLocationTripEndpoint(
  coordinate: unknown,
): Extract<TripEndpoint, { kind: 'current-location' }> | null {
  if (typeof coordinate !== 'object' || coordinate === null) return null
  const { longitude, latitude } = coordinate as Partial<TripCoordinate>
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !isValidLocationCoordinates(longitude, latitude)
  ) return null

  return Object.freeze({
    kind: 'current-location',
    coordinate: Object.freeze({ longitude, latitude }),
  })
}

export function getTripEndpointKey(endpoint: TripEndpoint): string {
  if (endpoint.kind === 'current-location') {
    return `current-location:${endpoint.coordinate.longitude}:${endpoint.coordinate.latitude}`
  }
  return `${endpoint.kind}:${endpoint.id}`
}

export function createEmptyTripRequest(): TripRequest {
  return { origin: null, destination: null }
}

export function setTripEndpoint(
  request: TripRequest,
  role: TripEndpointRole,
  endpoint: TripEndpoint,
): TripRequest {
  return role === 'origin'
    ? { ...request, origin: endpoint }
    : { ...request, destination: endpoint }
}

export function clearTripEndpoint(
  request: TripRequest,
  role: TripEndpointRole,
): TripRequest {
  return role === 'origin'
    ? { ...request, origin: null }
    : { ...request, destination: null }
}

export function swapTripEndpoints(request: TripRequest): TripRequest {
  return {
    origin: request.destination,
    destination: request.origin,
  }
}

function isCompleteEndpoint(endpoint: TripEndpoint | null): endpoint is TripEndpoint {
  if (endpoint === null) return false
  if (endpoint.kind === 'current-location') {
    return createCurrentLocationTripEndpoint(endpoint.coordinate) !== null
  }
  return (endpoint.kind === 'venue' || endpoint.kind === 'building' || endpoint.kind === 'stop') &&
    typeof endpoint.id === 'string' &&
    endpoint.id.trim().length > 0
}

function validateEndpoint(
  endpoint: TripEndpoint | null,
  roleLabel: string,
): string | null {
  if (endpoint === null) return `${roleLabel} is required.`
  if (!isCompleteEndpoint(endpoint)) return `${roleLabel} selection is incomplete.`
  return null
}

export function validateTripRequest(request: TripRequest): string | null {
  const origin = request.origin
  const destination = request.destination

  const originError = validateEndpoint(origin, 'Origin')
  if (originError) return originError

  const destinationError = validateEndpoint(destination, 'Destination')
  if (destinationError) return destinationError

  if (origin === null || destination === null) return null

  if (getTripEndpointKey(origin) === getTripEndpointKey(destination)) {
    return 'Origin and destination must be different locations.'
  }

  return null
}

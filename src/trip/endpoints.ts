import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../types/trip'

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
  return (
    endpoint !== null &&
    (endpoint.kind === 'venue' || endpoint.kind === 'stop') &&
    typeof endpoint.id === 'string' &&
    endpoint.id.trim().length > 0
  )
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

  if (origin === null || destination === null) {
    return null
  }

  if (origin.kind === destination.kind && origin.id === destination.id) {
    return 'Origin and destination must be different locations.'
  }

  return null
}

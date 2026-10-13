import { isValidLocationCoordinates } from '../../domain/location/coordinates'
import type { TransitIndex } from '../../domain/transit'
import { getTripEndpointKey } from '../../domain/trip/endpoints'
import type { TripEndpoint } from '../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { PathEndpointLocation } from '../path'

export interface ResolvedPathLocation extends PathEndpointLocation {
  readonly key: string
}

export interface ResolvedPathEndpoints {
  readonly origin: ResolvedPathLocation
  readonly destination: ResolvedPathLocation
  readonly all: readonly ResolvedPathLocation[]
}

function toCoordinate(longitude: number, latitude: number) {
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? { longitude, latitude }
    : null
}

function resolveEndpoint(
  endpoint: TripEndpoint,
  venues: VenueLocationMap,
  transit: TransitIndex,
): ResolvedPathLocation | null {
  if (endpoint.kind === 'current-location') {
    const { longitude, latitude } = endpoint.coordinate
    if (!isValidLocationCoordinates(longitude, latitude)) return null
    // Current location carries the frozen fix captured when the endpoint was chosen.
    return {
      key: getTripEndpointKey(endpoint),
      endpoint,
      coordinate: { longitude, latitude },
    }
  }

  if (endpoint.kind === 'venue') {
    const location = venues[endpoint.id]?.location
    const coordinate = location ? toCoordinate(location.x, location.y) : null
    if (!coordinate) return null
    return { key: getTripEndpointKey(endpoint), endpoint, coordinate }
  }

  const stop = transit.stopById.get(endpoint.id)
  const coordinate = stop ? toCoordinate(stop.longitude, stop.latitude) : null
  if (!coordinate) return null
  return { key: getTripEndpointKey(endpoint), endpoint, coordinate }
}

function addLocation(
  locations: Map<string, ResolvedPathLocation>,
  location: ResolvedPathLocation,
): void {
  if (!locations.has(location.key)) locations.set(location.key, location)
}

export function resolvePathEndpoints(
  originEndpoint: TripEndpoint,
  destinationEndpoint: TripEndpoint,
  venues: VenueLocationMap,
  transit: TransitIndex,
): ResolvedPathEndpoints | null {
  const origin = resolveEndpoint(originEndpoint, venues, transit)
  const destination = resolveEndpoint(destinationEndpoint, venues, transit)
  if (!origin || !destination || origin.key === destination.key) return null

  const locations = new Map<string, ResolvedPathLocation>()
  addLocation(locations, origin)
  addLocation(locations, destination)
  for (const stop of transit.stops) {
    const coordinate = toCoordinate(stop.longitude, stop.latitude)
    if (!coordinate) continue
    const endpoint: TripEndpoint = { kind: 'stop', id: stop.id }
    addLocation(locations, {
      key: getTripEndpointKey(endpoint),
      endpoint,
      coordinate,
    })
  }

  return { origin, destination, all: [...locations.values()] }
}

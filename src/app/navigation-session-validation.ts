import type { TransitIndex } from '../domain/transit'
import type { TripEndpoint, TripEndpointRole } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocation, VenueLocationMap } from '../domain/venue/types'

type MappedVenue = VenueLocation & {
  readonly location: { readonly x: number; readonly y: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasMappedLocation(venue: VenueLocation | undefined): venue is MappedVenue {
  const location = venue?.location
  return location !== undefined && Number.isFinite(location.x) && Number.isFinite(location.y)
}

export function isTripEndpointRole(value: unknown): value is TripEndpointRole {
  return value === 'origin' || value === 'destination'
}

export function isKnownTripEndpoint(
  endpoint: unknown,
  venues: VenueLocationMap | null,
  transitIndex: TransitIndex | null,
): endpoint is TripEndpoint {
  if (!isRecord(endpoint) || typeof endpoint.id !== 'string' || endpoint.id.trim().length === 0) return false
  if (endpoint.kind === 'venue') return hasMappedLocation(venues?.[endpoint.id])
  if (endpoint.kind === 'stop') return transitIndex?.stopById.has(endpoint.id) ?? false
  return false
}

export function venuesMatch(first: VenueLocation, second: VenueLocation): boolean {
  const firstLocation = first.location
  const secondLocation = second.location
  const locationsMatch = firstLocation === undefined || secondLocation === undefined
    ? firstLocation === secondLocation
    : firstLocation.x === secondLocation.x && firstLocation.y === secondLocation.y
  return first.roomName === second.roomName && first.floor === second.floor && locationsMatch
}

export function createVenueSearchResultSnapshot(code: string, venue: VenueLocation): VenueSearchResult {
  return Object.freeze({ code, venue })
}

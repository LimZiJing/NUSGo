import type { TransitIndex } from '../domain/transit'
import type { TripEndpoint, TripEndpointRole } from '../domain/trip/types'
import type { BuildingIndex } from '../domain/venue/building-index'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocation, VenueLocationMap } from '@navus/shared/venue/types'
import { createCurrentLocationTripEndpoint } from '../domain/trip/endpoints'

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

export function canonicalizeTripEndpoint(
  endpoint: unknown,
  venues: VenueLocationMap | null,
  transitIndex: TransitIndex | null,
  buildings: BuildingIndex | null = null,
): TripEndpoint | null {
  if (!isRecord(endpoint)) return null
  if (endpoint.kind === 'current-location') {
    return createCurrentLocationTripEndpoint(endpoint.coordinate)
  }
  if (typeof endpoint.id !== 'string' || endpoint.id.trim().length === 0) return null
  if (endpoint.kind === 'venue' && hasMappedLocation(venues?.[endpoint.id])) {
    return { kind: 'venue', id: endpoint.id }
  }
  if (endpoint.kind === 'building' && buildings?.byId.has(endpoint.id)) {
    return { kind: 'building', id: endpoint.id }
  }
  if (endpoint.kind === 'stop' && transitIndex?.stopById.has(endpoint.id)) {
    return { kind: 'stop', id: endpoint.id }
  }
  return null
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

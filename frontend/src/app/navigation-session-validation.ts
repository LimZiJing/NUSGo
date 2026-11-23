import type { TransitIndex } from '../domain/transit'
import type { TripEndpoint, TripEndpointRole } from '../domain/trip/types'
import type { BuildingIndex } from '../domain/venue/building-index'
import type { VenueSearchResult } from '../domain/venue/search'
import type { Venue, VenueMap } from '@nusgo/shared/venue/types'
import { createCurrentLocationTripEndpoint } from '../domain/trip/endpoints'
import { createPersonalWaypointTripEndpoint } from '../domain/trip/personal-waypoint-endpoints'
import type { PersonalWaypoint } from '../domain/waypoints/personal/personal-waypoint'

type MappedVenue = Venue & {
  readonly location: { readonly x: number; readonly y: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasMappedLocation(venue: Venue | undefined): venue is MappedVenue {
  const location = venue?.location
  return location !== undefined && Number.isFinite(location.x) && Number.isFinite(location.y)
}

export function isTripEndpointRole(value: unknown): value is TripEndpointRole {
  return value === 'origin' || value === 'destination'
}

export function canonicalizeTripEndpoint(
  endpoint: unknown,
  venues: VenueMap | null,
  transitIndex: TransitIndex | null,
  buildings: BuildingIndex | null = null,
  personalWaypoints: ReadonlyMap<string, PersonalWaypoint> | null = null,
): TripEndpoint | null {
  if (!isRecord(endpoint)) return null
  if (endpoint.kind === 'current-location') {
    return createCurrentLocationTripEndpoint(endpoint.coordinate)
  }
  if (endpoint.kind === 'personal-waypoint') {
    if (typeof endpoint.id !== 'string') return null
    const waypoint = personalWaypoints?.get(endpoint.id)
    return waypoint ? createPersonalWaypointTripEndpoint(waypoint) : null
  }
  if (typeof endpoint.id !== 'string' || endpoint.id.trim().length === 0) return null
  if (endpoint.kind === 'venue' && hasMappedLocation(venues?.[endpoint.id])) {
    return { kind: 'venue', id: endpoint.id }
  }
  if (endpoint.kind === 'building' && (buildings?.byId.has(endpoint.id) || buildings?.byPartId.has(endpoint.id))) {
    return { kind: 'building', id: endpoint.id }
  }
  if (endpoint.kind === 'stop' && transitIndex?.stopById.has(endpoint.id)) {
    return { kind: 'stop', id: endpoint.id }
  }
  return null
}

export function venuesMatch(first: Venue, second: Venue): boolean {
  if (first.kind !== second.kind || first.buildingId !== second.buildingId) return false
  const firstLocation = first.location
  const secondLocation = second.location
  const locationsMatch = firstLocation === undefined || secondLocation === undefined
    ? firstLocation === secondLocation
    : firstLocation.x === secondLocation.x && firstLocation.y === secondLocation.y
  const identityMatches = first.kind === 'food'
    ? second.kind === 'food' && first.name === second.name && first.foodType === second.foodType
    : second.kind === 'room' && first.roomName === second.roomName && first.floor === second.floor
  return identityMatches && locationsMatch
}

export function createVenueSearchResultSnapshot(code: string, venue: Venue): VenueSearchResult {
  return Object.freeze({ code, venue })
}

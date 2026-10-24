import { getTripEndpointLabel } from '../../../domain/location/search'
import type { TransitIndex } from '../../../domain/transit'
import type { TripEndpoint } from '../../../domain/trip/types'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import type { BuildingIndex } from '../../../domain/venue/building-index'

export function getEndpointLabel(
  endpoint: TripEndpoint,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
  buildings: BuildingIndex | null,
): string {
  return getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [], buildings ?? undefined)
}

export function getEndpointKindLabel(endpoint: TripEndpoint): string | null {
  if (endpoint.kind === 'venue') return 'venue'
  if (endpoint.kind === 'building') return 'building'
  if (endpoint.kind === 'stop') return 'bus stop'
  return null
}

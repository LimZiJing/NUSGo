import { getTripEndpointLabel } from '../../domain/location/search'
import type { TransitIndex } from '../../domain/transit'
import type { TripEndpoint, TripRequest, TripEndpointRole } from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'

function getTripSummaryEndpointLabel(
  role: TripEndpointRole,
  endpoint: TripEndpoint | null,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): string {
  return endpoint
    ? getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [])
    : `Choose ${role}`
}

export function getTripPlanSummary(
  tripRequest: TripRequest,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): { readonly visible: string; readonly accessible: string } {
  const origin = getTripSummaryEndpointLabel('origin', tripRequest.origin, venues, networkIndex)
  const destination = getTripSummaryEndpointLabel(
    'destination',
    tripRequest.destination,
    venues,
    networkIndex,
  )
  const summary = `${origin} → ${destination}`
  return {
    visible: summary,
    accessible: `Plan trip: origin ${origin}; destination ${destination}`,
  }
}

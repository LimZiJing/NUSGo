export type TripCoordinate = import('@nusgo/shared/routing/path').TripCoordinate
type CanonicalTripEndpoint = import('@nusgo/shared/routing/path').TripEndpoint
import type { FoodVenue, RoomVenue } from '@nusgo/shared/venue/types'

export interface PersonalWaypointTripEndpoint {
  readonly kind: 'personal-waypoint'
  readonly id: string
  readonly label: string
  readonly coordinate: TripCoordinate
}

export type TripEndpoint = CanonicalTripEndpoint | PersonalWaypointTripEndpoint

export type TripEndpointRole = 'origin' | 'destination'

export interface TripRequest {
  readonly origin: TripEndpoint | null
  readonly destination: TripEndpoint | null
}

type VenueEndpoint = Extract<CanonicalTripEndpoint, { readonly kind: 'venue' }>

export type TripLocationSearchResult =
  | { readonly kind: 'room'; readonly endpoint: VenueEndpoint; readonly venue: RoomVenue; readonly label: string; readonly detail: string }
  | { readonly kind: 'food'; readonly endpoint: VenueEndpoint; readonly venue: FoodVenue; readonly label: string; readonly detail: string }
  | { readonly kind: 'building'; readonly endpoint: Extract<CanonicalTripEndpoint, { readonly kind: 'building' }>; readonly label: string; readonly detail: string }
  | { readonly kind: 'stop'; readonly endpoint: Extract<CanonicalTripEndpoint, { readonly kind: 'stop' }>; readonly label: string; readonly detail: string }
  | { readonly kind: 'personal-waypoint'; readonly endpoint: PersonalWaypointTripEndpoint; readonly label: string; readonly detail: string }

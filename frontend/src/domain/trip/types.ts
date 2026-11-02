export type TripCoordinate = import('@nusgo/shared/routing/path').TripCoordinate
type CanonicalTripEndpoint = import('@nusgo/shared/routing/path').TripEndpoint

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

export type TripLocationSearchResult = {
  endpoint: TripEndpoint
  label: string
  detail: string
}

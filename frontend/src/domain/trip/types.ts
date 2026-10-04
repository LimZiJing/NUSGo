export type TripEndpoint = (
  | { readonly kind: 'venue'; readonly id: string }
  | { readonly kind: 'stop'; readonly id: string }
)

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

export interface TripCoordinate {
  readonly longitude: number
  readonly latitude: number
}

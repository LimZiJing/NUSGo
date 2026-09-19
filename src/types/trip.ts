export type TripEndpoint = (
  | { kind: 'venue'; id: string }
  | { kind: 'stop'; id: string }
)

export type TripEndpointRole = 'origin' | 'destination'

export interface TripRequest {
  origin: TripEndpoint | null
  destination: TripEndpoint | null
}

export type TripLocationSearchResult = {
  endpoint: TripEndpoint
  label: string
  detail: string
}

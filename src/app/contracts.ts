import { type TransitNetworkIndex } from '../domain/transit'
import type { TransitNetwork, TransitRoute, TransitRouteGeometry, TransitStop } from '../domain/transit/types'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../domain/trip/types'
import type { VenueLocation, VenueLocationMap } from '../domain/venue/types'

export interface TransitMapData {
  readonly network: TransitNetwork
  readonly geometry: TransitRouteGeometry
}

export interface LoadedTransitData extends TransitMapData {
  readonly index: TransitNetworkIndex
}

export interface VenueData {
  readonly venues: VenueLocationMap
  readonly venueCount: number
}

export interface MapRouteSelection {
  readonly route: TransitRoute | null
  readonly overlappingRouteIds: ReadonlySet<string>
}

export interface MapSession {
  readonly ready: Promise<void>
  loadTransitData(
    data: LoadedTransitData,
    onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
  ): number
  setRouteSelection(selection: MapRouteSelection): void
  setTripRequest(
    request: TripRequest,
    venues: VenueLocationMap,
    stops: readonly TransitStop[],
  ): void
  selectVenue(venue: VenueLocation): void
  clearVenue(): void
  dispose(): void
}

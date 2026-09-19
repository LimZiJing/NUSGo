import type { TransitIndex } from '../../domain/transit'
import type {
  TransitRoute,
} from '../../domain/transit/types'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../domain/trip/types'
import type { VenueLocation, VenueLocationMap } from '../../domain/venue/types'
import type { LoadedTransitData } from './data'

export interface MapSessionOptions {
  readonly container: HTMLElement
  readonly onMapError: (error: unknown) => void
  readonly onEmptyMapClick: () => void
}

export interface MapRouteSelection {
  readonly route: TransitRoute | null
  readonly overlappingRouteIds: ReadonlySet<string>
}

/**
 * The application-facing map seam. Implementations own all MapLibre objects,
 * listeners, DOM nodes, and asynchronous map work behind this interface.
 */
export interface MapSession {
  readonly ready: Promise<void>
  loadTransitData(
    data: LoadedTransitData,
    selection: MapRouteSelection,
    onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
  ): void
  setRouteSelection(selection: MapRouteSelection): void
  setTripRequest(
    request: TripRequest,
    venues: VenueLocationMap,
    transitIndex: TransitIndex | null,
  ): void
  selectVenue(venue: VenueLocation): void
  clearVenue(): void
  dispose(): void
}

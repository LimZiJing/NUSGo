import type { TransitIndex } from '../../domain/transit'
import type {
  TransitRoute,
} from '../../domain/transit/types'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../domain/trip/types'
import type { Journey } from '../../domain/trip/journey'
import type { DeviceLocationFix } from '../../domain/location/types'
import type { VenueLocation, VenueLocationMap } from '../../domain/venue/types'
import type { LoadedTransitData } from './data'

export interface MapSessionOptions {
  readonly container: HTMLElement
  readonly onMapError: (error: unknown) => void
  readonly onEmptyMapClick: () => void
  /** Returns true when the mobile Stops sheet owns the stop context. */
  readonly onStopSelected?: (stopId: string) => boolean
  readonly onMapInteraction?: () => void
  /** Centre of the map area left visible by the current overlays. */
  readonly onMapCenterChange?: (center: MapCoordinate) => void
}

export type MapCoordinate = readonly [number, number]

export interface MapViewportInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export type MapResetTarget =
  | { readonly kind: 'venue'; readonly center: MapCoordinate; readonly zoom: number }
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'trip'; readonly coordinates: readonly MapCoordinate[] }
  | { readonly kind: 'campus'; readonly center: MapCoordinate; readonly zoom: number }

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
  setRouteSelection(selection: MapRouteSelection, fit?: boolean): void
  refitRoute(): void
  focusStop(stopId: string): void
  focusStopInStopsTab(stopId: string): void
  setStopsPinVisible(visible: boolean): void
  setTripRequest(
    request: TripRequest,
    venues: VenueLocationMap,
    transitIndex: TransitIndex | null,
  ): void
  setJourney(journey: Journey | null): void
  setCurrentLocation(fix: DeviceLocationFix | null, visible: boolean): void
  focusCurrentLocation(fix: DeviceLocationFix): void
  /**
   * Post-render synchronization point for measured map overlays. Implementations
   * consume at most the latest pending route/venue automatic fit here; later
   * inset reports update padding without refitting the user's camera.
   */
  setViewportInsets(insets: MapViewportInsets): void
  /** Closes the active MapLibre popup, returning whether one was open. */
  dismissPopup(): boolean
  zoomIn(): void
  zoomOut(): void
  resetView(target: MapResetTarget): void
  selectVenue(venue: VenueLocation): void
  clearVenue(): void
  dispose(): void
}

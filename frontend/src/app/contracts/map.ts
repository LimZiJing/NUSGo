import type { BuildingEntry, BuildingIndex } from '../../domain/venue/building-index'
import type { TransitIndex } from '../../domain/transit'
import type {
  BusRoute,
} from '@nusgo/shared/transit/types'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../domain/trip/types'
import type { Path } from '@nusgo/shared/routing/path'
import type { DeviceLocationFix } from '../../domain/location/types'
import type { VenueLocation, VenueLocationMap } from '@nusgo/shared/venue/types'
import type { LoadedTransitData } from './data'
import type { ShuttleVehiclePosition } from '@nusgo/shared'
import type { PersonalWaypoint } from '../../domain/waypoints/personal/personal-waypoint'

export interface MapBuildingSelection {
  readonly name: string
  readonly locations: readonly NonNullable<VenueLocation['location']>[]
  /** The one location to mark distinctly and fit the camera to, when a single building part is chosen. */
  readonly highlighted?: NonNullable<VenueLocation['location']>
}

export interface MapSessionOptions {
  readonly container: HTMLElement
  /** Optional route matching limits for Live-bus positions. */
  readonly liveBusRouteMatching?: LiveBusRouteMatchingOptions
  /** Reports use of a local style so the application can offer online recovery. */
  readonly onBasemapUnavailable?: () => void
  readonly onMapError: (error: unknown) => void
  readonly onEmptyMapClick: (coordinate: MapCoordinate) => void
  /** Returns true when the mobile Stops sheet owns the stop context. */
  readonly onStopSelected?: (stopId: string) => boolean
  /** Opens Stop details after a person chooses that action in a live bus popup. */
  readonly onStopDetailsSelected?: (stopId: string) => void
  /** Selects a displayed Journey option from a map route or duration label. */
  readonly onJourneyOptionSelected?: (candidateKey: string) => void
  /** Centre of the map area left visible by the current overlays. */
  readonly onMapCenterChange?: (center: MapCoordinate) => void
  /** True during camera movement; false after the settled visible centre has been reported. */
  readonly onMapMovingChange?: (moving: boolean) => void
}

export interface LiveBusRouteMatchingOptions {
  /** Maximum route-progress speed; matching never trusts the unconfirmed NUS speed field. */
  readonly maximumSpeedMetersPerSecond: number
  /** Extra movement allowance for GPS error and route-projection noise. */
  readonly gpsMovementToleranceMeters: number
  /** Keep candidates this far from the nearest GPS projection for branch scoring. */
  readonly branchDistanceToleranceMeters: number
  /** Score weight applied to the difference between bus heading and travel direction. */
  readonly headingPreferenceWeight: number
  /** Reset continuity after this long without an accepted observation. */
  readonly continuityHorizonMs: number
}

export type MapCoordinate = readonly [number, number]

export interface MapViewportInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** An exact MapLibre camera position, so a temporary workflow can return to it unchanged. */
export interface MapCameraSnapshot {
  readonly center: MapCoordinate
  readonly zoom: number
  readonly bearing: number
  readonly pitch: number
}

export type MapResetTarget =
  | { readonly kind: 'venue'; readonly center: MapCoordinate; readonly zoom: number }
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'trip'; readonly coordinates: readonly MapCoordinate[] }
  | { readonly kind: 'campus'; readonly center: MapCoordinate; readonly zoom: number }

export interface MapRouteSelection {
  readonly route: BusRoute | null
  readonly overlappingRouteIds: ReadonlySet<string>
}

export interface MapJourneyOption {
  readonly candidateKey: string
  readonly path: Path
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
  /** Updates live bus markers; hidden layers release markers and expiry timers. */
  setLiveVehicles(vehicles: readonly ShuttleVehiclePosition[], visible: boolean): void
  setRouteSelection(selection: MapRouteSelection, fit?: boolean): void
  refitRoute(): void
  focusStop(stopId: string): void
  focusStopInStopsTab(stopId: string): void
  /** Forgets the Stops pin so it stays hidden until another stop is focused. */
  clearStopsPin(): void
  setStopsPinVisible(visible: boolean): void
  /** Accents the bus-stop markers for these stop IDs; an empty list clears the accent. */
  setNearbyStopHighlight(stopIds: readonly string[]): void
  /** Shows or hides the planned Journey layers and trip endpoint markers without discarding them. */
  setPlanLayersVisible(visible: boolean): void
  setTripRequest(
    request: TripRequest,
    venues: VenueLocationMap,
    transitIndex: TransitIndex | null,
    buildings?: BuildingIndex | null,
  ): void
  setJourneyOptions(
    options: readonly MapJourneyOption[],
    selectedCandidateKey: string | null,
    fitOverview?: boolean,
  ): void
  fitJourneyRoutes(): void
  fitSelectedJourney(): void
  /**
   * Draws the blue Current location dot. `trusted` carries the shared location policy: an untrusted
   * or stale fix keeps the dot but never stands in for a nearby origin circle.
   */
  setCurrentLocation(fix: DeviceLocationFix | null, visible: boolean, trusted?: boolean): void
  focusCurrentLocation(fix: DeviceLocationFix): void
  /**
   * Post-render synchronization point for measured map overlays. Implementations
   * consume at most the latest pending route/venue automatic fit here; later
   * inset reports update padding without refitting the user's camera.
   */
  setViewportInsets(insets: MapViewportInsets): void
  /** Updates the transient Stops sheet position; null restores canonical viewport insets. */
  setPresentationBottomInset(bottom: number | null): void
  /** Zoom around the visible-area centre while a centre crosshair is shown. */
  setVisibleCenterZoom(enabled: boolean): void
  /** Shows the temporary Personal Waypoint pin; only placement mode permits dragging it. */
  setPersonalWaypointPlacement(
    coordinate: MapCoordinate | null,
    editable: boolean,
    onDrag: (coordinate: MapCoordinate) => void,
  ): void
  /** Shows saved Personal Waypoint markers without changing the map camera. */
  setPersonalWaypoints(
    waypoints: readonly PersonalWaypoint[],
    visible: boolean,
    onSelect: (waypointId: string, trigger: HTMLButtonElement) => void,
    selectedWaypointId?: string | null,
  ): void
  /**
   * Shows a saved Personal Waypoint marker and centers it, keeping the map area left visible by
   * `occlusion` (which may include a panel the session does not measure itself) in view.
   */
  focusPersonalWaypoint(waypoint: PersonalWaypoint, occlusion?: MapViewportInsets): void
  /** Reads the exact camera position without moving it. */
  captureCamera(): MapCameraSnapshot
  /** Returns to a captured camera position, without animation when reduced motion is preferred. */
  restoreCamera(snapshot: MapCameraSnapshot): void
  /** Moves the camera to a coordinate without changing zoom, keeping existing overlays in view. */
  panToCoordinate(coordinate: MapCoordinate): void
  /** Closes the active bus-stop popup, returning whether one was open. */
  dismissStopPopup(): boolean
  /** Closes the active MapLibre popup, returning whether one was open. */
  dismissPopup(): boolean
  zoomIn(): void
  zoomOut(): void
  resetView(target: MapResetTarget): void
  selectVenue(venue: VenueLocation): void
  /** Re-applies the selected venue or building fit with the current insets, without waiting for an inset report. */
  refitSelectedVenue(): void
  /** Marks every part of a building, or a repeated-name group, and fits the camera to all of them. */
  selectBuilding(building: MapBuildingSelection): void
  clearVenue(): void
  /** Shows block-range labels for the buildings' navigable parts; replaces the previous set. */
  setBuildingLabels(entries: readonly BuildingEntry[]): void
  dispose(): void
}

import type { ExploreMode } from '../features/explore/state/explore-state'
import type { TransitIndex } from '../domain/transit'
import { isMobileLayoutWidth } from '../domain/layout-breakpoint'
import type { LocationTrackingState } from '../domain/location/types'
import { isValidLocationCoordinates } from '../domain/location/coordinates'
import type { TripRequest } from '../domain/trip/types'
import { getTripEndpointCoordinate, type TripEndpointLocationSources } from '../domain/trip/endpoint-location'
import type { BuildingIndex } from '../domain/venue/building-index'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type {
  MapCoordinate,
  MapResetTarget,
  MapViewportInsets,
} from './contracts/map'

export const MAP_OVERLAY_MARGIN = 12
export const CAMPUS_RESET_CENTER: readonly [number, number] = [103.7844, 1.2933]
// Keep a pre-load fallback that matches canonical KR-MRT in public/data/shuttle-network.json.
export const KENT_RIDGE_MRT_CENTER: readonly [number, number] = [103.784413, 1.29482]

function getTrackingFixCoordinate(location: LocationTrackingState): MapCoordinate | null {
  if (location.status !== 'tracking' || !location.latestFix) return null
  const { longitude, latitude } = location.latestFix
  if (!isValidLocationCoordinates(longitude, latitude)) return null

  return [longitude, latitude]
}

export function getLocationControlTarget(location: LocationTrackingState): MapResetTarget {
  return {
    kind: 'campus',
    center: getTrackingFixCoordinate(location) ?? KENT_RIDGE_MRT_CENTER,
    zoom: 15,
  }
}

export interface MapOverlayMeasurements {
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly tripCardHeight: number
  readonly activeSheetHeight: number
  readonly tripCardVisible: boolean
  readonly activeSheetVisible: boolean
  readonly desktopNavigationWidth: number
}

export type { MapCoordinate, MapResetTarget, MapViewportInsets } from './contracts/map'

export interface ResetTargetContext {
  readonly panelMode: ExploreMode
  readonly selectedVenue: VenueSearchResult | null
  readonly selectedRouteId: string | null
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap | null
  readonly buildings?: BuildingIndex | null
  readonly transitIndex: TransitIndex | null
}

export function calculateMapOverlayInsets(
  measurements: MapOverlayMeasurements,
): MapViewportInsets {
  if (!isMobileLayoutWidth(measurements.viewportWidth)) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: Math.ceil(Math.max(0, measurements.desktopNavigationWidth)) + MAP_OVERLAY_MARGIN,
    }
  }

  return {
    top: measurements.tripCardVisible
      ? Math.ceil(Math.max(0, measurements.tripCardHeight)) + MAP_OVERLAY_MARGIN
      : 0,
    right: MAP_OVERLAY_MARGIN,
    bottom: measurements.activeSheetVisible
      ? Math.ceil(Math.max(0, measurements.activeSheetHeight)) + MAP_OVERLAY_MARGIN
      : 0,
    left: MAP_OVERLAY_MARGIN,
  }
}

function getEndpointCoordinate(
  endpoint: TripRequest['origin'],
  sources: TripEndpointLocationSources,
): MapCoordinate | null {
  if (!endpoint) return null
  const coordinate = getTripEndpointCoordinate(endpoint, sources)
  return coordinate ? [coordinate.longitude, coordinate.latitude] : null
}

export function getResetTarget(context: ResetTargetContext): MapResetTarget {
  const hasCurrentLocationEndpoint = context.tripRequest.origin?.kind === 'current-location' ||
    context.tripRequest.destination?.kind === 'current-location'
  if (context.panelMode === 'venue-detail' && !hasCurrentLocationEndpoint) {
    const selectedLocation = context.selectedVenue?.venue.location
    if (selectedLocation && Number.isFinite(selectedLocation.x) && Number.isFinite(selectedLocation.y)) {
      return {
        kind: 'venue',
        center: [selectedLocation.x, selectedLocation.y],
        zoom: 17,
      }
    }
  }

  if (
    context.panelMode === 'bus-routes' &&
    !hasCurrentLocationEndpoint &&
    context.selectedRouteId &&
    context.transitIndex?.routeById.has(context.selectedRouteId)
  ) {
    return { kind: 'route', routeId: context.selectedRouteId }
  }

  const sources = {
    venues: context.venues,
    buildings: context.buildings ?? null,
    transitIndex: context.transitIndex,
  }
  const coordinates = [
    getEndpointCoordinate(context.tripRequest.origin, sources),
    getEndpointCoordinate(context.tripRequest.destination, sources),
  ].filter((coordinate): coordinate is MapCoordinate => coordinate !== null)
  if (coordinates.length > 0) return { kind: 'trip', coordinates }

  if (context.selectedRouteId && context.transitIndex?.routeById.has(context.selectedRouteId)) {
    return { kind: 'route', routeId: context.selectedRouteId }
  }

  return { kind: 'campus', center: CAMPUS_RESET_CENTER, zoom: 15 }
}

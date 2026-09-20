import type { ContextualPanelMode } from '../features/contextual-panel/state'
import type { TransitIndex } from '../domain/transit'
import type { TripRequest } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { VenueLocationMap } from '../domain/venue/types'
import type {
  MapCoordinate,
  MapResetTarget,
  MapViewportInsets,
} from './contracts/map'

export const MOBILE_MAP_BREAKPOINT = 768
export const MAP_OVERLAY_MARGIN = 12
export const CAMPUS_RESET_CENTER: readonly [number, number] = [103.7844, 1.2933]

export interface MapOverlayMeasurements {
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly tripCardHeight: number
  readonly contextualSheetHeight: number
  readonly tripCardVisible: boolean
  readonly contextualSheetVisible: boolean
}

export type { MapCoordinate, MapResetTarget, MapViewportInsets } from './contracts/map'

export interface ResetTargetContext {
  readonly panelMode: ContextualPanelMode
  readonly selectedVenue: VenueSearchResult | null
  readonly selectedRouteId: string | null
  readonly tripRequest: TripRequest
  readonly venues: VenueLocationMap | null
  readonly transitIndex: TransitIndex | null
}

export function calculateMapOverlayInsets(
  measurements: MapOverlayMeasurements,
): MapViewportInsets {
  if (measurements.viewportWidth > MOBILE_MAP_BREAKPOINT) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  return {
    top: measurements.tripCardVisible
      ? Math.ceil(Math.max(0, measurements.tripCardHeight)) + MAP_OVERLAY_MARGIN
      : 0,
    right: MAP_OVERLAY_MARGIN,
    bottom: measurements.contextualSheetVisible
      ? Math.ceil(Math.max(0, measurements.contextualSheetHeight)) + MAP_OVERLAY_MARGIN
      : 0,
    left: MAP_OVERLAY_MARGIN,
  }
}

function getVenueCoordinate(
  id: string,
  venues: VenueLocationMap | null,
): MapCoordinate | null {
  const location = venues?.[id]?.location
  if (!location || !Number.isFinite(location.x) || !Number.isFinite(location.y)) return null
  return [location.x, location.y]
}

function getEndpointCoordinate(
  request: TripRequest['origin'],
  venues: VenueLocationMap | null,
  transitIndex: TransitIndex | null,
): MapCoordinate | null {
  if (!request) return null
  if (request.kind === 'venue') return getVenueCoordinate(request.id, venues)
  const stop = transitIndex?.stopById.get(request.id)
  if (!stop || !Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) return null
  return [stop.longitude, stop.latitude]
}

export function getResetTarget(context: ResetTargetContext): MapResetTarget {
  if (context.panelMode === 'venue-detail') {
    const selectedLocation = context.selectedVenue?.venue.location
    if (selectedLocation && Number.isFinite(selectedLocation.x) && Number.isFinite(selectedLocation.y)) {
      return {
        kind: 'venue',
        center: [selectedLocation.x, selectedLocation.y],
        zoom: 17,
      }
    }
  }

  if (context.panelMode === 'shuttle' && context.selectedRouteId && context.transitIndex?.routeById.has(context.selectedRouteId)) {
    return { kind: 'route', routeId: context.selectedRouteId }
  }

  const coordinates = [
    getEndpointCoordinate(context.tripRequest.origin, context.venues, context.transitIndex),
    getEndpointCoordinate(context.tripRequest.destination, context.venues, context.transitIndex),
  ].filter((coordinate): coordinate is MapCoordinate => coordinate !== null)
  if (coordinates.length > 0) return { kind: 'trip', coordinates }

  if (context.selectedRouteId && context.transitIndex?.routeById.has(context.selectedRouteId)) {
    return { kind: 'route', routeId: context.selectedRouteId }
  }

  return { kind: 'campus', center: CAMPUS_RESET_CENTER, zoom: 15 }
}

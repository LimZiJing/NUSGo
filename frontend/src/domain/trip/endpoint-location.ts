import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { TransitIndex } from '../transit'
import { isValidLocationCoordinates } from '../location/coordinates'
import type { BuildingIndex } from '../venue/building-index'
import type { TripCoordinate, TripEndpoint } from './types'

export interface TripEndpointLocationSources {
  readonly venues: VenueLocationMap | null
  readonly buildings: BuildingIndex | null
  readonly transitIndex: Pick<TransitIndex, 'stopById'> | null
}

function toCoordinate(longitude: number, latitude: number): TripCoordinate | null {
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null
}

/**
 * Where a journey starts or ends. A building resolves to its own location and a stop to its
 * boarding location, even when both share a name, so the two identities never merge.
 */
export function getTripEndpointCoordinate(
  endpoint: TripEndpoint,
  sources: TripEndpointLocationSources,
): TripCoordinate | null {
  switch (endpoint.kind) {
    case 'current-location': {
      const { longitude, latitude } = endpoint.coordinate
      return isValidLocationCoordinates(longitude, latitude) ? { longitude, latitude } : null
    }
    case 'venue': {
      const location = sources.venues?.[endpoint.id]?.location
      return location ? toCoordinate(location.x, location.y) : null
    }
    case 'building': {
      const location = sources.buildings?.byId.get(endpoint.id)?.location
      return location ? toCoordinate(location.x, location.y) : null
    }
    case 'stop': {
      const stop = sources.transitIndex?.stopById.get(endpoint.id)
      return stop ? toCoordinate(stop.longitude, stop.latitude) : null
    }
  }
}

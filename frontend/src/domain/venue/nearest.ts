import { getDistanceMeters } from '../location/coordinates'
import type { DeviceLocationFix } from '../location/types'
import { hasVenueCoordinates } from './details'
import type { VenueSearchResult } from './search'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'

export function findNearestVenue(
  venues: VenueLocationMap,
  location: Pick<DeviceLocationFix, 'longitude' | 'latitude'>,
): VenueSearchResult | null {
  let nearest: { readonly code: string; readonly distanceMeters: number } | null = null

  for (const [code, venue] of Object.entries(venues)) {
    if (!hasVenueCoordinates(venue)) continue
    const venueLocation = venue.location
    if (!venueLocation) continue
    const distanceMeters = getDistanceMeters(location, {
      longitude: venueLocation.x,
      latitude: venueLocation.y,
    })
    if (
      nearest === null ||
      distanceMeters < nearest.distanceMeters ||
      (distanceMeters === nearest.distanceMeters && code < nearest.code)
    ) {
      nearest = { code, distanceMeters }
    }
  }

  return nearest === null
    ? null
    : { code: nearest.code, venue: venues[nearest.code]! }
}

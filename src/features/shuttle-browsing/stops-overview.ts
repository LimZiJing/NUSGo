import { getDistanceMeters, type TransitIndex } from '../../domain/transit'
import type { TransitStop } from '../../domain/transit/types'
import type { DeviceLocationFix } from '../../domain/location/types'

export const NEARBY_STOP_RADIUS_METERS = 200

export interface StopOverviewItem {
  readonly stop: TransitStop
  readonly distanceMeters: number | null
}

type Coordinate = { readonly longitude: number; readonly latitude: number }

export function getStopsOverview(
  index: TransitIndex | null,
  list: 'nearby' | 'favourites',
  center: Coordinate | null,
  fix: DeviceLocationFix | null,
  favoriteStopIds: readonly string[],
): readonly StopOverviewItem[] {
  if (!index) return []
  const favorites = new Set(favoriteStopIds)
  return index.stops
    .filter((stop) => list === 'favourites' ? favorites.has(stop.id) : true)
    .map((stop) => ({
      stop,
      distanceMeters: fix ? getDistanceMeters(fix, stop) : null,
    }))
    .sort((first, second) => (
      list === 'nearby' && center
        ? getDistanceMeters(center, first.stop) - getDistanceMeters(center, second.stop)
        : first.stop.longName.localeCompare(second.stop.longName)
    ) || first.stop.id.localeCompare(second.stop.id))
}

export function getStopsWithinNearbyRadius(
  index: TransitIndex | null,
  center: Coordinate | null,
  fix: DeviceLocationFix | null,
): readonly StopOverviewItem[] {
  if (!center) return []
  return getStopsOverview(index, 'nearby', center, fix, [])
    .filter(({ stop }) => getDistanceMeters(center, stop) <= NEARBY_STOP_RADIUS_METERS)
}

import { getDistanceMeters, type TransitIndex } from '../../../domain/transit'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type { DeviceLocationFix } from '../../../domain/location/types'
import type { StopDetailsModel } from './stop-details-model'

export const NEARBY_STOP_RADIUS_METERS = 250

export interface StopListStop {
  readonly stop: TransitStop
  readonly distanceMeters: number | null
}

export interface StopListEntry {
  readonly stop: StopDetailsModel
  readonly distanceMeters: number | null
  readonly favorite: boolean
  readonly expanded: boolean
}

type Coordinate = { readonly longitude: number; readonly latitude: number }

export function getStopsForList(
  index: TransitIndex | null,
  list: 'nearby' | 'favourites',
  center: Coordinate | null,
  fix: DeviceLocationFix | null,
  favoriteStopIds: readonly string[],
): readonly StopListStop[] {
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
): readonly StopListStop[] {
  if (!center) return []
  return getStopsForList(index, 'nearby', center, null, [])
    .filter(({ stop }) => getDistanceMeters(center, stop) <= NEARBY_STOP_RADIUS_METERS)
}

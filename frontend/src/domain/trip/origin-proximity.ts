import type { DeviceLocationFix } from '../location/types'
import type { TripCoordinate } from './types'
import { getDistanceMeters, isValidLocationCoordinates } from '../location/coordinates'

/**
 * Within this many metres the origin circle only repeats the Current location dot drawn on the same
 * spot, so the circle is suppressed instead of stacked underneath it. The boundary is inclusive and
 * measured on the ground rather than in screen pixels, so it holds at every zoom level.
 */
export const CURRENT_LOCATION_ORIGIN_MERGE_DISTANCE_METERS = 20

export interface CurrentLocationStandIn {
  /** The fix the blue Current location dot is drawn for. */
  readonly fix: DeviceLocationFix | null
  /** The dot is shown at all. A hidden dot cannot stand in for the origin. */
  readonly visible: boolean
  /** The shared location policy still trusts the fix, so stale or failed fixes never stand in. */
  readonly trusted: boolean
}

/**
 * True when the visible Current location dot already marks the selected origin, so drawing the
 * origin circle would put two markers on one spot. Only that marker is omitted; the selected or
 * frozen endpoint and the Path stay exactly as they were.
 */
export function isOriginDuplicatedByCurrentLocation(
  origin: TripCoordinate | null,
  currentLocation: CurrentLocationStandIn,
): boolean {
  const { fix, visible, trusted } = currentLocation
  if (!origin || !visible || !trusted || !fix) return false
  if (!isValidLocationCoordinates(fix.longitude, fix.latitude)) return false
  return getDistanceMeters(origin, fix) <= CURRENT_LOCATION_ORIGIN_MERGE_DISTANCE_METERS
}

import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import type { DeviceLocationFix } from '../location/types'
import { getDistanceMeters } from '../location/coordinates'
import type { TransitIndex } from './index'

export const MAX_ROUTE_FOLLOW_ACCURACY_METERS = 25
export const MAX_ROUTE_FOLLOW_FIX_AGE_MS = 30_000
export const STOP_CONFIRMATION_RADIUS_METERS = 25
export const STOP_CONFIRMATION_RESET_RADIUS_METERS = 40
export const STOP_ARRIVAL_RADIUS_METERS = 75

export interface NearbyBusStopCandidate {
  readonly stop: TransitStop
  readonly distanceMeters: number
}

export function isRouteFollowFixUsable(
  fix: DeviceLocationFix | null,
  now = Date.now(),
): fix is DeviceLocationFix {
  if (!fix) return false
  const age = now - fix.timestamp
  return Number.isFinite(fix.longitude) &&
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    fix.accuracy <= MAX_ROUTE_FOLLOW_ACCURACY_METERS &&
    age >= 0 &&
    age <= MAX_ROUTE_FOLLOW_FIX_AGE_MS
}

function getCandidate(stop: TransitStop, fix: DeviceLocationFix): NearbyBusStopCandidate {
  return {
    stop,
    distanceMeters: getDistanceMeters(
      { longitude: fix.longitude, latitude: fix.latitude },
      { longitude: stop.longitude, latitude: stop.latitude },
    ),
  }
}

export function findNearbyBusStopCandidates(
  fix: DeviceLocationFix | null,
  transitIndex: TransitIndex,
  radiusMeters = STOP_CONFIRMATION_RADIUS_METERS,
  now = Date.now(),
): readonly NearbyBusStopCandidate[] {
  if (!isRouteFollowFixUsable(fix, now)) return []

  return getRouteFollowingStops(transitIndex)
    .map((stop) => getCandidate(stop, fix))
    .filter(({ distanceMeters }) => distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters || first.stop.id.localeCompare(second.stop.id))
}

export function isWithinStopConfirmationRadius(
  fix: DeviceLocationFix | null,
  stop: TransitStop,
  now = Date.now(),
): boolean {
  if (!isRouteFollowFixUsable(fix, now)) return false
  return getCandidate(stop, fix).distanceMeters <= STOP_CONFIRMATION_RADIUS_METERS
}

function getRouteFollowingStops(transitIndex: TransitIndex): TransitStop[] {
  return transitIndex.stops.filter((stop) => stop.services.some((serviceId) => transitIndex.routeById.has(serviceId)))
}

export function isAtBusStop(
  fix: DeviceLocationFix | null,
  stop: TransitStop,
  now = Date.now(),
): boolean {
  if (!isRouteFollowFixUsable(fix, now)) return false
  return getDistanceMeters(
    { longitude: fix.longitude, latitude: fix.latitude },
    { longitude: stop.longitude, latitude: stop.latitude },
  ) <= STOP_ARRIVAL_RADIUS_METERS
}

export function getRouteStartIndex(route: BusRoute, stopId: string): number {
  return route.stopIds.indexOf(stopId)
}

export function getBusStopName(stop: TransitStop): string {
  return stop.shortName.trim() || stop.longName.trim() || stop.id
}

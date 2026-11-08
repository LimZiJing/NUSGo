import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import type { DeviceLocationFix } from '../location/types'
import { getDistanceMeters } from '../location/coordinates'
import type { TransitIndex } from './index'

export const MAX_ROUTE_FOLLOW_ACCURACY_METERS = 25
export const MAX_ROUTE_FOLLOW_FIX_AGE_MS = 30_000
export const MAX_NEARBY_STOP_DISTANCE_METERS = 250
export const STOP_ARRIVAL_RADIUS_METERS = 75

interface StopCandidate {
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

function selectUnambiguousStop(
  fix: DeviceLocationFix,
  candidates: readonly StopCandidate[],
  excludedStopIds: ReadonlySet<string>,
): TransitStop | null {
  const orderedCandidates = candidates
    .filter(({ stop }) => !excludedStopIds.has(stop.id))
    .sort((first, second) => first.distanceMeters - second.distanceMeters || first.stop.id.localeCompare(second.stop.id))
  const closest = orderedCandidates[0]
  if (!closest || closest.distanceMeters > MAX_NEARBY_STOP_DISTANCE_METERS) return null

  const nextClosest = orderedCandidates[1]
  if (nextClosest && nextClosest.distanceMeters - closest.distanceMeters <= fix.accuracy * 2) {
    return null
  }

  return closest.stop
}

function getCandidate(stop: TransitStop, fix: DeviceLocationFix): StopCandidate {
  return {
    stop,
    distanceMeters: getDistanceMeters(
      { longitude: fix.longitude, latitude: fix.latitude },
      { longitude: stop.longitude, latitude: stop.latitude },
    ),
  }
}

export function findNearbyBusStopSuggestion(
  fix: DeviceLocationFix | null,
  transitIndex: TransitIndex,
  excludedStopIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): TransitStop | null {
  if (!isRouteFollowFixUsable(fix, now)) return null

  const candidates = getRouteFollowingStops(transitIndex).map((stop) => getCandidate(stop, fix))

  return selectUnambiguousStop(fix, candidates, excludedStopIds)
}

export function getRouteFollowingStops(transitIndex: TransitIndex): TransitStop[] {
  return transitIndex.stops.filter((stop) => stop.services.some((serviceId) => transitIndex.routeById.has(serviceId)))
}

export function findRouteStopSuggestion(
  fix: DeviceLocationFix | null,
  route: BusRoute,
  transitIndex: TransitIndex,
  excludedStopIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): TransitStop | null {
  if (!isRouteFollowFixUsable(fix, now)) return null

  const stopIds = new Set(route.stopIds)
  const candidates = transitIndex.stops
    .filter((stop) => stopIds.has(stop.id))
    .map((stop) => getCandidate(stop, fix))

  return selectUnambiguousStop(fix, candidates, excludedStopIds)
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

export { createTransitIndex, createTransitNetworkIndex, TransitIndexPreconditionError } from '@nusgo/shared/transit/index'
export type { TransitIndex, TransitNetworkIndex } from '@nusgo/shared/transit/index'
export { deriveBusRouteOverlapMap } from './overlap'
export { findNearbyShuttleStops } from './nearby-stops'
export { getDistanceMeters } from '../location/coordinates'
export type { NearbyShuttleStop } from './nearby-stops'
export {
  findNearbyBusStopCandidates,
  getBusStopName,
  getRouteStartIndex,
  isAtBusStop,
  isWithinStopConfirmationRadius,
  isRouteFollowFixUsable,
  MAX_ROUTE_FOLLOW_ACCURACY_METERS,
  MAX_ROUTE_FOLLOW_FIX_AGE_MS,
  STOP_CONFIRMATION_RADIUS_METERS,
  STOP_CONFIRMATION_RESET_RADIUS_METERS,
  STOP_ARRIVAL_RADIUS_METERS,
} from './route-following'
export { getReachableFavoriteStops } from './reachable-stops'
export type {
  ShuttleArrivalSnapshot,
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
} from './arrivals'

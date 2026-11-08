export { createTransitIndex, createTransitNetworkIndex, TransitIndexPreconditionError } from '@nusgo/shared/transit/index'
export type { TransitIndex, TransitNetworkIndex } from '@nusgo/shared/transit/index'
export { deriveBusRouteOverlapMap } from './overlap'
export { findNearbyShuttleStops } from './nearby-stops'
export { getDistanceMeters } from '../location/coordinates'
export type { NearbyShuttleStop } from './nearby-stops'
export {
  findNearbyBusStopSuggestion,
  findRouteStopSuggestion,
  getRouteFollowingStops,
  getBusStopName,
  getRouteStartIndex,
  isAtBusStop,
  isRouteFollowFixUsable,
  MAX_NEARBY_STOP_DISTANCE_METERS,
  MAX_ROUTE_FOLLOW_ACCURACY_METERS,
  MAX_ROUTE_FOLLOW_FIX_AGE_MS,
  STOP_ARRIVAL_RADIUS_METERS,
} from './route-following'
export { getReachableFavoriteStops } from './reachable-stops'
export type {
  ShuttleArrivalSnapshot,
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
} from './arrivals'

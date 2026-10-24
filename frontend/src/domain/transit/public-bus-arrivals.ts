import type { PublicBusArrivalSnapshot } from '@nusgo/shared'

export type {
  PublicBusServiceArrivalStatus,
  PublicBusEstimatedArrival,
  PublicBusServiceArrival,
  PublicBusStopArrivalData,
  PublicBusArrivalSnapshot,
} from '@nusgo/shared'
export {
  PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS,
  PUBLIC_BUS_ARRIVAL_FRESHNESS_MS,
  PUBLIC_BUS_ARRIVAL_MAX_AGE_MS,
} from '@nusgo/shared'

export function isOlderPublicBusArrivalSnapshot(
  candidate: PublicBusArrivalSnapshot,
  current: PublicBusArrivalSnapshot,
): boolean {
  return Date.parse(candidate.refreshedAt) < Date.parse(current.refreshedAt)
}

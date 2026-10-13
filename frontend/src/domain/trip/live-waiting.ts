import type { ShuttleArrivalSnapshot } from '../transit/arrivals'
import type { ShuttleTimingRecord } from '@navus/shared/transit/timing'
import type {
  BusWaitingTimeContext,
  BusWaitingTimeProvider,
} from '../../pathfinding/search/search-path-candidates'

const LIVE_DATA_STALE_AFTER_SECONDS = 45
const LIVE_DATA_EXPIRED_AFTER_SECONDS = 120

function getSnapshotAgeSeconds(observedAtMs: number, nowMs: number): number | null {
  const ageSeconds = Math.floor((nowMs - observedAtMs) / 1000)
  if (
    ageSeconds < 0 ||
    ageSeconds > LIVE_DATA_EXPIRED_AFTER_SECONDS ||
    ageSeconds > LIVE_DATA_STALE_AFTER_SECONDS
  ) return null
  return ageSeconds
}

export function createLiveBusWaitingTimeProvider(
  snapshot: ShuttleArrivalSnapshot,
  nowMs = Date.now(),
): BusWaitingTimeProvider {
  return (_record: ShuttleTimingRecord, context: BusWaitingTimeContext) => {
    const stop = snapshot.stops[context.boardingStopId]
    const route = stop?.[context.routeId]
    if (!route) return null

    const observation = snapshot.stopObservations?.[context.boardingStopId] ?? {
      observedAt: snapshot.observedAt,
      expiresAt: snapshot.expiresAt,
    }
    const observedAtMs = Date.parse(observation.observedAt)
    const expiresAtMs = Date.parse(observation.expiresAt)
    const snapshotAgeSeconds = Number.isFinite(observedAtMs)
      ? getSnapshotAgeSeconds(observedAtMs, nowMs)
      : null
    if (
      snapshotAgeSeconds === null ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= observedAtMs ||
      expiresAtMs <= nowMs
    ) return null

    const elapsedSinceObservation = snapshotAgeSeconds + context.elapsedSeconds
    const nextArrival = route.upcomingArrivalSeconds.find(
      (arrivalSeconds) => arrivalSeconds >= elapsedSinceObservation,
    )
    if (nextArrival !== undefined) {
      return nextArrival - elapsedSinceObservation
    }
    if (route.headwaySeconds === null) return null
    return Math.max(1, Math.round(route.headwaySeconds.median / 2))
  }
}

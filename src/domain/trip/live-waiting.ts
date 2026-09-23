import type { ShuttleArrivalSnapshot } from '../transit/arrivals'
import type { ShuttleTimingRecord } from '../transit/timing'
import type {
  ShuttleWaitingTimeContext,
  ShuttleWaitingTimeProvider,
} from './planner'

function getSnapshotAgeSeconds(snapshot: ShuttleArrivalSnapshot, nowMs: number): number {
  const observedAtMs = Date.parse(snapshot.observedAt)
  if (!Number.isFinite(observedAtMs)) return 0
  return Math.max(0, Math.floor((nowMs - observedAtMs) / 1000))
}

export function createLiveShuttleWaitingTimeProvider(
  snapshot: ShuttleArrivalSnapshot,
  nowMs = Date.now(),
): ShuttleWaitingTimeProvider {
  return (_record: ShuttleTimingRecord, context: ShuttleWaitingTimeContext) => {
    const route = snapshot.stops[context.boardingStopId]?.[context.routeId]
    if (!route) return null

    const elapsedSinceObservation = getSnapshotAgeSeconds(snapshot, nowMs) + context.elapsedSeconds
    const nextArrival = route.upcomingArrivalSeconds.find(
      (arrivalSeconds) => arrivalSeconds >= elapsedSinceObservation,
    )
    if (nextArrival !== undefined) return nextArrival - elapsedSinceObservation
    if (route.headwaySeconds === null) return null
    return Math.max(1, Math.round(route.headwaySeconds.median / 2))
  }
}

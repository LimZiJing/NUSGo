import type { ShuttleArrivalSnapshot } from '@nusgo/shared'

/** A delay worth telling someone about, derived from two consecutive arrival snapshots. */
export interface ServiceDelayUpdate {
  readonly kind: 'delay'
  readonly stopId: string
  readonly routeId: string
  /** How much later the bus is than the previous snapshot predicted, in seconds. */
  readonly delaySeconds: number
}

/** A stop that stopped returning fresh arrivals, which reads to riders as a service disruption. */
export interface ServiceUnavailableUpdate {
  readonly kind: 'unavailable'
  readonly stopId: string
}

export type ServiceUpdate = ServiceDelayUpdate | ServiceUnavailableUpdate

export interface DetectServiceUpdatesOptions {
  /** A bus must be at least this much later than predicted before it counts as delayed. */
  readonly delayThresholdSeconds: number
  /** One notification per stop and route per this window, so a wait that keeps growing is announced once. */
  readonly repeatWindowMs: number
  readonly now: () => number
}

export const DEFAULT_DELAY_THRESHOLD_SECONDS = 180
export const DEFAULT_SERVICE_UPDATE_REPEAT_WINDOW_MS = 30 * 60_000

/**
 * Compares two published snapshots and reports rider-visible service changes.
 *
 * This reads data the snapshot store already produced, so detection adds no upstream calls and
 * no second poller. Only stops that are fresh in both generations are compared; a stop that was
 * already unavailable is not announced again.
 */
export function createServiceUpdateDetector(
  options: Partial<DetectServiceUpdatesOptions> = {},
): (previous: ShuttleArrivalSnapshot, next: ShuttleArrivalSnapshot) => readonly ServiceUpdate[] {
  const delayThresholdSeconds = options.delayThresholdSeconds ?? DEFAULT_DELAY_THRESHOLD_SECONDS
  const repeatWindowMs = options.repeatWindowMs ?? DEFAULT_SERVICE_UPDATE_REPEAT_WINDOW_MS
  const now = options.now ?? Date.now
  const lastAnnouncedAtMs = new Map<string, number>()

  const shouldAnnounce = (key: string, atMs: number): boolean => {
    const announcedAtMs = lastAnnouncedAtMs.get(key)
    if (announcedAtMs !== undefined && atMs - announcedAtMs < repeatWindowMs) return false
    lastAnnouncedAtMs.set(key, atMs)
    return true
  }

  return (previous, next) => {
    const observedAtMs = now()
    const updates: ServiceUpdate[] = []
    const unavailableStopIds = new Set(next.unavailableStopIds ?? [])

    for (const [stopId, nextRoutes] of Object.entries(next.stops)) {
      const previousRoutes = previous.stops[stopId]
      // Only stops observed in both generations can be compared; a stop the provider had already
      // dropped is not a fresh change.
      if (!previousRoutes || !previous.stopObservations?.[stopId]) continue

      if (unavailableStopIds.has(stopId)) {
        if (!(previous.unavailableStopIds ?? []).includes(stopId) && shouldAnnounce('unavailable:' + stopId, observedAtMs)) {
          updates.push({ kind: 'unavailable', stopId })
        }
        continue
      }

      const elapsedSeconds = elapsedSecondsBetween(previous, next, stopId)
      if (elapsedSeconds === null) continue

      for (const [routeId, nextArrival] of Object.entries(nextRoutes)) {
        const previousArrival = previousRoutes[routeId]
        if (!previousArrival) continue
        // Once the predicted bus should already have arrived, the next reading describes a
        // different bus, so the difference says nothing about lateness.
        if (previousArrival.nextArrivalSeconds - elapsedSeconds <= 0) continue
        const delaySeconds = nextArrival.nextArrivalSeconds + elapsedSeconds - previousArrival.nextArrivalSeconds
        if (delaySeconds < delayThresholdSeconds) continue
        if (!shouldAnnounce('delay:' + stopId + ':' + routeId, observedAtMs)) continue
        updates.push({
          kind: 'delay',
          stopId,
          routeId,
          delaySeconds: Math.round(delaySeconds),
        })
      }
    }

    return updates
  }
}

function elapsedSecondsBetween(
  previous: ShuttleArrivalSnapshot,
  next: ShuttleArrivalSnapshot,
  stopId: string,
): number | null {
  const previousObservedAt = Date.parse(previous.stopObservations?.[stopId]?.observedAt ?? previous.observedAt)
  const nextObservedAt = Date.parse(next.stopObservations?.[stopId]?.observedAt ?? next.observedAt)
  if (!Number.isFinite(previousObservedAt) || !Number.isFinite(nextObservedAt)) return null
  const elapsedSeconds = (nextObservedAt - previousObservedAt) / 1000
  if (elapsedSeconds <= 0) return null
  return elapsedSeconds
}

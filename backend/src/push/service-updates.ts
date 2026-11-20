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
 * Bounds how many undelivered updates are carried between refresh cycles.
 *
 * A pending update is retried until the push service accepts it or it ages out, so a provider or
 * push-service outage cannot grow this without limit. Dropping the oldest entry only means one
 * alert is never retried; retaining it could mean delivering a long stale one.
 */
const MAX_PENDING_UPDATES = 50

export interface ServiceUpdateDetector {
  /**
   * Updates worth announcing for this pair of snapshots.
   *
   * This includes updates detected earlier whose delivery the push service has not yet accepted,
   * because the pair of predictions that showed them no longer exists. Recording a cooldown when
   * they were detected would lose such an alert instead of retrying it.
   */
  observe(previous: ShuttleArrivalSnapshot, next: ShuttleArrivalSnapshot): readonly ServiceUpdate[]
  /**
   * Retires an update the push service accepted: it leaves the retry queue and its stop and route
   * stay quiet for the repeat window. Anything not accepted stays queued.
   */
  accept(update: ServiceUpdate): void
}

/**
 * Compares two published snapshots and reports rider-visible service changes.
 *
 * This reads data the snapshot store already produced, so detection adds no upstream calls and
 * no second poller. Only stops that are fresh in both generations are compared; a stop that was
 * already unavailable is not announced again.
 *
 * An update is offered until a delivery is accepted, so a transient push failure or a full hourly
 * budget retries it on a later cycle rather than losing the alert. A queued alert follows later
 * readings of the same stop and route: it reports the current delay, and it is dropped when the
 * bus catches up or the stop recovers, because then there is nothing left to warn about.
 */
export function createServiceUpdateDetector(
  options: Partial<DetectServiceUpdatesOptions> = {},
): ServiceUpdateDetector {
  const delayThresholdSeconds = options.delayThresholdSeconds ?? DEFAULT_DELAY_THRESHOLD_SECONDS
  const repeatWindowMs = options.repeatWindowMs ?? DEFAULT_SERVICE_UPDATE_REPEAT_WINDOW_MS
  const now = options.now ?? Date.now
  const lastAnnouncedAtMs = new Map<string, number>()
  /** key -> the update to retry and when it was first detected, in detection order. */
  const pending = new Map<string, { update: ServiceUpdate; readonly detectedAtMs: number }>()

  const isCoolingDown = (key: string, atMs: number): boolean => {
    const announcedAtMs = lastAnnouncedAtMs.get(key)
    return announcedAtMs !== undefined && atMs - announcedAtMs < repeatWindowMs
  }

  const queue = (update: ServiceUpdate, atMs: number): void => {
    const key = keyOf(update)
    const existing = pending.get(key)
    if (existing) {
      // Keep the first detection time so a retried alert still ages out on schedule, but report
      // the latest reading rather than the one that first triggered it.
      existing.update = update
      return
    }
    pending.set(key, { update, detectedAtMs: atMs })
    while (pending.size > MAX_PENDING_UPDATES) {
      const oldest = pending.keys().next()
      if (oldest.done) break
      pending.delete(oldest.value)
    }
  }

  const observe = (
    previous: ShuttleArrivalSnapshot,
    next: ShuttleArrivalSnapshot,
  ): readonly ServiceUpdate[] => {
    const observedAtMs = now()
    // An alert older than the repeat window describes a bus that has had time to arrive, so it is
    // no longer worth sending and must not be retried indefinitely.
    for (const [key, entry] of pending) {
      if (observedAtMs - entry.detectedAtMs >= repeatWindowMs) pending.delete(key)
    }

    const unavailableStopIds = new Set(next.unavailableStopIds ?? [])

    for (const [stopId, nextRoutes] of Object.entries(next.stops)) {
      const previousRoutes = previous.stops[stopId]
      // Only stops observed in both generations can be compared; a stop the provider had already
      // dropped is not a fresh change.
      if (!previousRoutes || !previous.stopObservations?.[stopId]) continue

      if (unavailableStopIds.has(stopId)) {
        const update: ServiceUnavailableUpdate = { kind: 'unavailable', stopId }
        const key = keyOf(update)
        if (
          !(previous.unavailableStopIds ?? []).includes(stopId) &&
          !pending.has(key) &&
          !isCoolingDown(key, observedAtMs)
        ) queue(update, observedAtMs)
        continue
      }

      // The stop is reporting arrivals again, so a queued outage alert no longer applies.
      pending.delete(keyOf({ kind: 'unavailable', stopId }))

      const elapsedSeconds = elapsedSecondsBetween(previous, next, stopId)
      if (elapsedSeconds === null) continue

      for (const [routeId, nextArrival] of Object.entries(nextRoutes)) {
        const previousArrival = previousRoutes[routeId]
        if (!previousArrival) continue
        const key = 'delay:' + stopId + ':' + routeId
        // Once the predicted bus should already have arrived, the next reading describes a
        // different bus, so the difference says nothing about lateness.
        if (previousArrival.nextArrivalSeconds - elapsedSeconds <= 0) {
          pending.delete(key)
          continue
        }
        const delaySeconds = nextArrival.nextArrivalSeconds + elapsedSeconds - previousArrival.nextArrivalSeconds
        if (delaySeconds < delayThresholdSeconds) {
          // The bus made up the time, so a queued alert for it is no longer true.
          pending.delete(key)
          continue
        }
        if (isCoolingDown(key, observedAtMs)) continue
        queue({ kind: 'delay', stopId, routeId, delaySeconds: Math.round(delaySeconds) }, observedAtMs)
      }
    }

    return [...pending.values()].map(({ update }) => update)
  }

  return {
    observe,
    accept(update) {
      const key = keyOf(update)
      pending.delete(key)
      lastAnnouncedAtMs.set(key, now())
    },
  }
}

function keyOf(update: ServiceUpdate): string {
  return update.kind === 'delay'
    ? 'delay:' + update.stopId + ':' + update.routeId
    : 'unavailable:' + update.stopId
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

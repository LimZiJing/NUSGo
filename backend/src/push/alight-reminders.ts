import type { PushNotificationPayload, ShuttleArrivalSnapshot, ShuttleServiceStatus } from '@nusgo/shared'
import { SHUTTLE_ARRIVAL_FRESHNESS_MS, createAlightReminderPayload } from '@nusgo/shared'
import { deliverPushNotifications, type PushSendNotification } from './delivery.ts'
import type { NotificationCap } from './notification-cap.ts'
import type { AlightReminderRecord, AlightReminderRegistry } from './reminder-registry.ts'

/**
 * Why a watch did not produce a reminder. Each reason is explicit so the "no false arriving-now
 * push" rule is tested one case at a time rather than inferred from a count of sends.
 */
export type ReminderSkipReason =
  /** The watch passed its server-assigned expiry and has been, or will be, removed. */
  | 'expired'
  /** The published snapshot is past its own expiry, or older than the freshness constant. */
  | 'stale-snapshot'
  /** The stop was not observed in the published snapshot. */
  | 'unobserved-stop'
  /** The provider did not return this stop on this refresh. */
  | 'unavailable-stop'
  /** This stop has no live arrival data for the watched route. */
  | 'no-arrival'
  /** The service is not running for this route right now. */
  | 'not-running'
  /** A delivery for this watch is already in progress, so it must not be sent twice. */
  | 'delivery-in-flight'
  /** The next bus is further away than the lead time the rider chose. */
  | 'not-yet-close'

export interface DueReminder {
  readonly record: AlightReminderRecord
  readonly stopId: string
  readonly routeId: string
  readonly minutesUntilArrival: number
}

export interface SkippedReminder {
  readonly record: AlightReminderRecord
  readonly reason: ReminderSkipReason
}

export interface EvaluateAlightRemindersOptions {
  readonly now: () => number
  /**
   * Reads the shuttle service status for a route without fetching anything.
   *
   * `unknown` means no already-cached service data exists and evaluation then trusts the arrival
   * snapshot itself; only an explicit non-active status blocks a reminder.
   */
  readonly serviceStatus?: (routeId: string, atMs: number) => ShuttleServiceStatus | 'unknown'
  /** Returns true while a delivery for this watch is in flight; such a watch is skipped. */
  readonly inFlight?: (record: AlightReminderRecord) => boolean
}

export interface AlightReminderEvaluationResult {
  readonly due: readonly DueReminder[]
  readonly skipped: readonly SkippedReminder[]
}

function parseTime(value: string | undefined): number {
  if (!value) return Number.NaN
  return Date.parse(value)
}

function isFresh(observedAtMs: number, expiresAtMs: number, nowMs: number): boolean {
  return Number.isFinite(observedAtMs) &&
    nowMs - observedAtMs <= SHUTTLE_ARRIVAL_FRESHNESS_MS &&
    (!Number.isFinite(expiresAtMs) || nowMs <= expiresAtMs)
}

/**
 * Decides which registered watches deserve a reminder from one already-published snapshot.
 *
 * This is a pure read of `snapshot`: it never calls a provider, so adding reminders cannot change
 * upstream call volume. Every reason not to fire is checked before the arrival threshold, and a
 * reminder needs an unexpired watch with a fresh, observed, available stop, a real arrival for
 * that route while the service is running, and the bus inside the rider's own lead time. Anything
 * less is skipped, which is what keeps NUSGo from announcing "arriving now" for a bus that is
 * stale, dropped, or not in service.
 */
export function evaluateAlightReminders(
  records: readonly AlightReminderRecord[],
  snapshot: ShuttleArrivalSnapshot,
  options: EvaluateAlightRemindersOptions,
): AlightReminderEvaluationResult {
  const nowMs = options.now()
  const snapshotFresh = isFresh(
    parseTime(snapshot.observedAt),
    parseTime(snapshot.expiresAt),
    nowMs,
  )
  const unavailableStopIds = new Set(snapshot.unavailableStopIds ?? [])
  const due: DueReminder[] = []
  const skipped: SkippedReminder[] = []

  for (const record of records) {
    // Expiry is absolute and comes from this server's own clock, so it is checked before any
    // property of the snapshot: an expired watch can never push, fresh data or not.
    if (record.expiresAtMs <= nowMs) {
      skipped.push({ record, reason: 'expired' })
      continue
    }
    // A snapshot past its expiry, or older than the freshness constant, describes a service state
    // the rider would be misled by. One bad snapshot blocks every watch in it.
    if (!snapshotFresh) {
      skipped.push({ record, reason: 'stale-snapshot' })
      continue
    }

    const { stopId, routeId } = record.watch
    const observation = snapshot.stopObservations?.[stopId]
    if (!observation) {
      skipped.push({ record, reason: 'unobserved-stop' })
      continue
    }
    if (unavailableStopIds.has(stopId)) {
      skipped.push({ record, reason: 'unavailable-stop' })
      continue
    }
    // Per-stop freshness matters as well: a stop carried over from an older generation can sit in
    // an otherwise fresh snapshot, and its prediction would be out of date.
    if (!isFresh(parseTime(observation.observedAt), parseTime(observation.expiresAt), nowMs)) {
      skipped.push({ record, reason: 'stale-snapshot' })
      continue
    }

    const arrival = snapshot.stops[stopId]?.[routeId]
    if (!arrival || !Number.isFinite(arrival.nextArrivalSeconds) || arrival.nextArrivalSeconds < 0) {
      skipped.push({ record, reason: 'no-arrival' })
      continue
    }

    const serviceStatus = options.serviceStatus?.(routeId, nowMs) ?? 'unknown'
    if (serviceStatus !== 'unknown' && serviceStatus !== 'active') {
      skipped.push({ record, reason: 'not-running' })
      continue
    }

    if (arrival.nextArrivalSeconds > record.leadTimeSeconds) {
      skipped.push({ record, reason: 'not-yet-close' })
      continue
    }

    if (options.inFlight?.(record)) {
      skipped.push({ record, reason: 'delivery-in-flight' })
      continue
    }

    due.push({ record, stopId, routeId, minutesUntilArrival: arrival.nextArrivalSeconds / 60 })
  }

  return { due, skipped }
}

export interface AlightReminderPublisherOptions {
  readonly registry: AlightReminderRegistry
  /**
   * The process-wide hourly cap, shared with the service-update publisher and the HTTP routes.
   *
   * Delivery reserves a slot before each send and either commits or releases it, so one endpoint
   * cannot spend more than its hour across both topics, and a refused reservation leaves the watch
   * in place for a later snapshot.
   */
  readonly cap: NotificationCap
  readonly sendNotification: PushSendNotification
  /** Resolves a canonical stop name for a notification body. */
  readonly stopName: (stopId: string) => string | null
  /** The same zero-fetch service-status reader the evaluator relies on. */
  readonly serviceStatus?: (routeId: string, atMs: number) => ShuttleServiceStatus | 'unknown'
  readonly now?: () => number
}

export interface AlightReminderPublishResult {
  readonly notificationsSent: number
  readonly prunedEndpoints: readonly string[]
  /** Watches that reached their expiry during this pass and were removed. */
  readonly expiredEndpoints: readonly string[]
  readonly skipped: readonly SkippedReminder[]
}

export interface AlightReminderPublisher {
  /** Feeds one already-published snapshot and pushes any reminder it warrants. */
  publish(snapshot: ShuttleArrivalSnapshot): Promise<AlightReminderPublishResult>
  /** Forgets delivery history for an endpoint, called when its reminder is registered or removed. */
  forgetSubscription(endpoint: string): void
  /**
   * Supplies the service-running check after composition.
   *
   * The live-data layer is built after the push collaborators (it needs the snapshot hook), so the
   * reader is attached here instead of making the publisher constructor depend on itself.
   */
  setServiceStatus(reader: (routeId: string, atMs: number) => ShuttleServiceStatus | 'unknown'): void
  readonly cap: NotificationCap
}

/**
 * Turns published arrival snapshots into alight reminders for the `alight-reminders` topic.
 *
 * Like the service-update publisher this reads the snapshot the store already published, so it
 * adds no upstream request, no poller and no timer: callers hook it to the same refresh-complete
 * callback.
 *
 * A reminder is one-shot. A watch is removed only after the push service confirmed that exact
 * send, so a transient failure leaves the watch eligible for the next snapshot instead of
 * silently dropping it, and one delivery in flight is never started twice. Every removal — a
 * successful send, a 404/410, or an expiry — is scoped to the registration that was evaluated, so
 * a rider who removes and re-registers during a send keeps the newer watch.
 */
export function createAlightReminderPublisher(
  options: AlightReminderPublisherOptions,
): AlightReminderPublisher {
  const now = options.now ?? Date.now
  const cap = options.cap
  // Endpoints with a delivery started but not yet settled. A second snapshot that arrives while
  // the first send is still awaiting the push service must not send the same reminder again.
  const inFlight = new Set<string>()
  let serviceStatus = options.serviceStatus

  const publish = async (
    snapshot: ShuttleArrivalSnapshot,
  ): Promise<AlightReminderPublishResult> => {
    // Expiry is enforced before evaluation so a stale snapshot can never revive a dead watch.
    const expiredEndpoints = options.registry.pruneExpired()
    const records = options.registry.list()
    if (records.length === 0) {
      return { notificationsSent: 0, prunedEndpoints: [], expiredEndpoints, skipped: [] }
    }

    const readServiceStatus = serviceStatus
    const evaluation = evaluateAlightReminders(records, snapshot, {
      now,
      ...(readServiceStatus ? { serviceStatus: readServiceStatus } : {}),
      inFlight: (record) => inFlight.has(record.endpoint),
    })

    if (evaluation.due.length === 0) {
      return { notificationsSent: 0, prunedEndpoints: [], expiredEndpoints, skipped: evaluation.skipped }
    }

    const dueByEndpoint = new Map(evaluation.due.map((candidate) => [candidate.record.endpoint, candidate]))
    // Choosing a payload does not spend the hourly cap: delivery reserves the slot and commits it
    // only after the push service accepts the send, so a refused reservation leaves the watch
    // eligible for the next snapshot rather than silently dropping the reminder.
    const payloadFor = (record: AlightReminderRecord): PushNotificationPayload | null => {
      const match = dueByEndpoint.get(record.endpoint)
      if (!match) return null
      const stopName = options.stopName(match.stopId)
      if (!stopName) return null
      return createAlightReminderPayload(stopName, match.stopId, match.routeId, match.minutesUntilArrival)
    }

    // The pruner is scoped to the generation that was sent. Delivery calls it when the push
    // service reports 404/410; a re-registration during the send must not be deleted with it.
    const generations = new Map(evaluation.due.map(({ record }) => [record.endpoint, record.generation]))
    const pruner = {
      remove(endpoint: string): boolean {
        const generation = generations.get(endpoint)
        return generation === undefined ? false : options.registry.removeIfCurrent(endpoint, generation)
      },
    }

    for (const { record } of evaluation.due) inFlight.add(record.endpoint)
    try {
      const summary = await deliverPushNotifications(
        pruner,
        options.sendNotification,
        evaluation.due.map(({ record }) => record),
        {
          cap,
          payloadFor,
          // Retiring the watch here keeps it one-shot: delivery committed the cap slot already, and
          // the generation check leaves a watch re-registered during the send in place.
          onDelivered: (record) => {
            options.registry.removeIfCurrent(record.endpoint, record.generation)
          },
        },
      )

      return {
        notificationsSent: summary.deliveredCount,
        prunedEndpoints: summary.prunedEndpoints,
        expiredEndpoints,
        skipped: evaluation.skipped,
      }
    } finally {
      for (const { record } of evaluation.due) inFlight.delete(record.endpoint)
    }
  }

  return {
    publish,
    forgetSubscription(endpoint) {
      // A new or removed watch starts with a fresh hourly window rather than inheriting an old one.
      cap.reset(endpoint)
    },
    setServiceStatus(reader) {
      serviceStatus = reader
    },
    cap,
  }
}

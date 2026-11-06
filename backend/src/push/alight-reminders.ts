import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  createAlightReminderPayload,
  type PushNotificationPayload,
  type ShuttleArrivalSnapshot,
  type ShuttleServiceStatus,
} from '@nusgo/shared'
import type { PushConfig } from '../config.ts'
import type { PushSendNotification } from './delivery.ts'
import { deliverPushNotifications } from './delivery.ts'
import { createNotificationCap, type NotificationCap } from './notification-cap.ts'
import type { AlightReminderRecord, AlightReminderRegistry } from './reminder-registry.ts'

/** How close the next bus must be, in seconds, before a reminder is worth showing. */
export const DEFAULT_ALIGHT_REMINDER_THRESHOLD_SECONDS = 120

/**
 * Why a watch did not produce a reminder. Each reason is explicit so the "no false arriving-now
 * push" rule is tested one case at a time rather than inferred from a count of sends.
 */
export type ReminderSkipReason =
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
  /** The next bus is further away than the threshold. */
  | 'not-yet-close'
  /** The reminder for this arrival was already sent. */
  | 'already-sent'

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
  readonly thresholdSeconds?: number
  readonly now: () => number
  /**
   * Reads the shuttle service status for a route without fetching anything.
   *
   * `unknown` means no already-cached service data exists and evaluation then trusts the arrival
   * snapshot itself; only an explicit non-active status blocks a reminder.
   */
  readonly serviceStatus?: (routeId: string, atMs: number) => ShuttleServiceStatus | 'unknown'
  /** Returns true when this exact watch has already been announced for the current arrival. */
  readonly alreadySent?: (record: AlightReminderRecord) => boolean
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
 * reminder needs a fresh, observed, available stop with a real arrival for that route while the
 * service is running. Anything less is skipped, which is what keeps NUSGo from announcing
 * "arriving now" for a bus that is stale, dropped, or not in service.
 */
export function evaluateAlightReminders(
  records: readonly AlightReminderRecord[],
  snapshot: ShuttleArrivalSnapshot,
  options: EvaluateAlightRemindersOptions,
): AlightReminderEvaluationResult {
  const thresholdSeconds = options.thresholdSeconds ?? DEFAULT_ALIGHT_REMINDER_THRESHOLD_SECONDS
  const nowMs = options.now()

  // A snapshot past its expiry, or older than the freshness constant, describes a service state
  // the rider would be misled by. One bad snapshot blocks every watch in it.
  if (!isFresh(parseTime(snapshot.observedAt), parseTime(snapshot.expiresAt), nowMs)) {
    return {
      due: [],
      skipped: records.map((record) => ({ record, reason: 'stale-snapshot' as const })),
    }
  }

  const unavailableStopIds = new Set(snapshot.unavailableStopIds ?? [])
  const due: DueReminder[] = []
  const skipped: SkippedReminder[] = []

  for (const record of records) {
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

    if (arrival.nextArrivalSeconds > thresholdSeconds) {
      skipped.push({ record, reason: 'not-yet-close' })
      continue
    }

    if (options.alreadySent?.(record)) {
      skipped.push({ record, reason: 'already-sent' })
      continue
    }

    due.push({ record, stopId, routeId, minutesUntilArrival: arrival.nextArrivalSeconds / 60 })
  }

  return { due, skipped }
}

export interface AlightReminderPublisherOptions {
  readonly registry: AlightReminderRegistry
  readonly push: PushConfig
  readonly sendNotification: PushSendNotification
  /** Resolves a canonical stop name for a notification body. */
  readonly stopName: (stopId: string) => string | null
  /** The same zero-fetch service-status reader the evaluator relies on. */
  readonly serviceStatus?: (routeId: string, atMs: number) => ShuttleServiceStatus | 'unknown'
  readonly thresholdSeconds?: number
  readonly now?: () => number
}

export interface AlightReminderPublishResult {
  readonly notificationsSent: number
  readonly prunedEndpoints: readonly string[]
  readonly skipped: readonly SkippedReminder[]
}

export interface AlightReminderPublisher {
  /** Feeds one already-published snapshot and pushes any reminder it warrants. */
  publish(snapshot: ShuttleArrivalSnapshot): Promise<AlightReminderPublishResult>
  /** Forgets delivery history for an endpoint, called when its reminder is removed. */
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
 * adds no upstream request, no poller and no timer: callers hook it to the same
 * refresh-complete callback. A watch fires once per arrival and re-arms only once the next bus is
 * again further away than the threshold, so one approaching bus does not push on every refresh.
 */
export function createAlightReminderPublisher(
  options: AlightReminderPublisherOptions,
): AlightReminderPublisher {
  const now = options.now ?? Date.now
  const cap = createNotificationCap({ maxPerHour: options.push.notificationsPerHourCap, now })
  // Endpoints already reminded about their current arrival; cleared when the watch re-arms.
  const announced = new Set<string>()
  let serviceStatus = options.serviceStatus

  const publish = async (
    snapshot: ShuttleArrivalSnapshot,
  ): Promise<AlightReminderPublishResult> => {
    const records = options.registry.list()
    if (records.length === 0) return { notificationsSent: 0, prunedEndpoints: [], skipped: [] }

    const readServiceStatus = serviceStatus
    const evaluation = evaluateAlightReminders(records, snapshot, {
      ...(options.thresholdSeconds === undefined ? {} : { thresholdSeconds: options.thresholdSeconds }),
      now,
      ...(readServiceStatus ? { serviceStatus: readServiceStatus } : {}),
      alreadySent: (record) => announced.has(record.endpoint),
    })

    // A watch whose bus is still far away, or is gone from the data, has re-armed: the arrival it
    // was waiting for has passed or changed, so the next one may be announced.
    for (const { record, reason } of evaluation.skipped) {
      if (reason === 'not-yet-close' || reason === 'no-arrival') announced.delete(record.endpoint)
    }

    if (evaluation.due.length === 0) {
      return { notificationsSent: 0, prunedEndpoints: [], skipped: evaluation.skipped }
    }

    const dueByEndpoint = new Map(evaluation.due.map((candidate) => [candidate.record.endpoint, candidate]))
    const payloadFor = (record: AlightReminderRecord): PushNotificationPayload | null => {
      const match = dueByEndpoint.get(record.endpoint)
      if (!match) return null
      const stopName = options.stopName(match.stopId)
      if (!stopName) return null
      // The hourly cap is a product rule, not a delivery failure: the reminder stays registered.
      if (!cap.tryConsume(record.endpoint)) return null
      announced.add(record.endpoint)
      return createAlightReminderPayload(stopName, match.stopId, match.routeId, match.minutesUntilArrival)
    }

    const summary = await deliverPushNotifications(
      options.registry,
      options.sendNotification,
      evaluation.due.map(({ record }) => record),
      { payloadFor },
    )

    return {
      notificationsSent: summary.deliveredCount,
      prunedEndpoints: summary.prunedEndpoints,
      skipped: evaluation.skipped,
    }
  }

  return {
    publish,
    forgetSubscription(endpoint) {
      cap.reset(endpoint)
      announced.delete(endpoint)
    },
    setServiceStatus(reader) {
      serviceStatus = reader
    },
    cap,
  }
}

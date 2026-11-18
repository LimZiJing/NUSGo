import type { PushNotificationPayload } from '@nusgo/shared'
import type { NotificationCap } from './notification-cap.ts'
import type { PushSubscriptionRecord } from './subscription-store.ts'

/** Options every actual send must carry, so no call site can omit the bounds. */
export interface PushSendOptions {
  /** Seconds the push service may hold the message for an offline device. */
  readonly TTL: number
  /** Milliseconds before the sender abandons the request to the push service. */
  readonly timeout: number
  /** Requests prompt delivery rather than deferring time-sensitive alerts for power saving. */
  readonly urgency: 'high'
}

/** The subset of the web-push API this module needs, so tests can supply a fake. */
export type PushSendNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: PushSendOptions,
) => Promise<{ statusCode: number }>

// Arrival predictions change quickly; an offline device must not receive an old bus alert.
export const PUSH_NOTIFICATION_TTL_SECONDS = 2 * 60

/** A push-service request that has not answered by then is treated as a failed delivery. */
export const PUSH_NOTIFICATION_TIMEOUT_MS = 10_000

/**
 * The only thing delivery needs from whichever store holds the records: the ability to forget an
 * endpoint the push service reports as gone. A subscription store and the reminder registry both
 * satisfy this, so delivery stays one implementation for every topic.
 */
export interface PushSubscriptionPruner {
  /** Removes the record for an endpoint and reports whether one was held. */
  remove(endpoint: string): boolean
}

export interface DeliverySummary {
  /** Endpoints the push service rejected as gone and that were removed from the store. */
  readonly prunedEndpoints: readonly string[]
  /**
   * Endpoints the push service accepted one payload for.
   *
   * A caller that must act only after a real send — such as a one-shot reminder that is removed
   * once delivered — reads this, or `onDelivered`, instead of assuming that asking for a payload
   * delivered it.
   */
  readonly deliveredCount: number
  readonly failedCount: number
}

export interface DeliverOptions<TRecord extends PushSubscriptionRecord = PushSubscriptionRecord> {
  /** Shared across publishers so concurrent topics reserve the same endpoint allowance. */
  readonly cap?: NotificationCap
  /** Returns the payload for a subscription, or null to skip it (for example, over the hourly cap). */
  readonly payloadFor: (record: TRecord) => PushNotificationPayload | null
  /**
   * Called only after acceptance, for effects such as removing a delivered one-shot reminder.
   * The shared cap has already committed its reservation at this point.
   */
  readonly onDelivered?: (record: TRecord) => void
}

const MAX_CONCURRENT_DELIVERIES = 8

// Push services report a deleted subscription with the standard 404 or 410 codes, so the
// status is more reliable than each service's error wording.
function isExpiredStatusCode(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410
}

function statusCodeOf(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return Number.NaN
  return Number((error as { statusCode?: unknown }).statusCode)
}

/**
 * Sends one payload per subscription and removes the ones the push service rejected as gone.
 * Failures that are not expiry keep the subscription, because a temporary outage must not
 * silently unsubscribe someone.
 *
 * A supplied cap is claimed with `reserve` before the await and settled afterwards, so the hourly
 * budget follows what actually happened and overlapping passes cannot both spend the last slot.
 */
export async function deliverPushNotifications<TRecord extends PushSubscriptionRecord>(
  store: PushSubscriptionPruner,
  sendNotification: PushSendNotification,
  records: readonly TRecord[],
  options: DeliverOptions<TRecord>,
): Promise<DeliverySummary> {
  const prunedEndpoints: string[] = []
  let deliveredCount = 0
  let failedCount = 0
  let nextIndex = 0

  const deliverOne = async (record: TRecord): Promise<void> => {
    const payload = options.payloadFor(record)
    if (!payload) return
    const reservation = options.cap?.reserve(record.endpoint)
    if (options.cap && !reservation) return

    try {
      await sendNotification(
        { endpoint: record.endpoint, keys: record.keys },
        JSON.stringify(payload),
        { TTL: PUSH_NOTIFICATION_TTL_SECONDS, timeout: PUSH_NOTIFICATION_TIMEOUT_MS, urgency: 'high' },
      )
      reservation?.commit()
      deliveredCount += 1
      options.onDelivered?.(record)
    } catch (error: unknown) {
      if (isExpiredStatusCode(statusCodeOf(error))) {
        store.remove(record.endpoint)
        prunedEndpoints.push(record.endpoint)
        return
      }
      failedCount += 1
      console.warn('NUSGo push delivery failed.', {
        errorType: error instanceof Error ? error.name : typeof error,
      })
    } finally {
      reservation?.release()
    }
  }

  const worker = async (): Promise<void> => {
    while (nextIndex < records.length) {
      const record = records[nextIndex]
      nextIndex += 1
      if (record) await deliverOne(record)
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_DELIVERIES, records.length) }, worker))

  return { prunedEndpoints, deliveredCount, failedCount }
}

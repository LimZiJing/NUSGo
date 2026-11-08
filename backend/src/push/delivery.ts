import type { PushNotificationPayload } from '@nusgo/shared'
import type { PushSubscriptionRecord, PushSubscriptionStore } from './subscription-store.ts'

/** Options every actual send must carry, so no call site can omit the bounds. */
export interface PushSendOptions {
  /** Seconds the push service may hold the message for an offline device. */
  readonly TTL: number
  /** Milliseconds before the sender abandons the request to the push service. */
  readonly timeout: number
}

/** The subset of the web-push API this module needs, so tests can supply a fake. */
export type PushSendNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: PushSendOptions,
) => Promise<{ statusCode: number }>

/**
 * Short bound on how long a push service may hold a message for a device that is offline.
 *
 * Service updates describe a bus that is late or a stop that is briefly not updating, so a
 * notification delivered hours later is misleading. An hour still covers a phone that was in a
 * tunnel for the duration of a journey.
 */
export const PUSH_NOTIFICATION_TTL_SECONDS = 60 * 60

/** A push-service request that has not answered by then is treated as a failed delivery. */
export const PUSH_NOTIFICATION_TIMEOUT_MS = 10_000

export interface DeliverySummary {
  /** Endpoints the push service rejected as gone and that were removed from the store. */
  readonly prunedEndpoints: readonly string[]
  readonly deliveredCount: number
  readonly failedCount: number
}

export interface DeliverOptions {
  /** Returns the payload for a subscription, or null to skip it (for example, over the hourly cap). */
  readonly payloadFor: (record: PushSubscriptionRecord) => PushNotificationPayload | null
  /**
   * Called after the push service accepted a delivery. A product rule such as the hourly cap is
   * recorded here rather than when the payload was chosen, so a transient failure does not spend
   * the recipient's allowance.
   */
  readonly onDelivered?: (record: PushSubscriptionRecord) => void
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
 */
export async function deliverPushNotifications(
  store: PushSubscriptionStore,
  sendNotification: PushSendNotification,
  records: readonly PushSubscriptionRecord[],
  options: DeliverOptions,
): Promise<DeliverySummary> {
  const prunedEndpoints: string[] = []
  let deliveredCount = 0
  let failedCount = 0
  let nextIndex = 0

  const deliverOne = async (record: PushSubscriptionRecord): Promise<void> => {
    const payload = options.payloadFor(record)
    if (!payload) return

    try {
      await sendNotification(
        { endpoint: record.endpoint, keys: record.keys },
        JSON.stringify(payload),
        { TTL: PUSH_NOTIFICATION_TTL_SECONDS, timeout: PUSH_NOTIFICATION_TIMEOUT_MS },
      )
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

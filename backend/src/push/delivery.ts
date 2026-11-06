import type { PushNotificationPayload } from '@nusgo/shared'
import type { PushSubscriptionRecord } from './subscription-store.ts'

/** The subset of the web-push API this module needs, so tests can supply a fake. */
export type PushSendNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<{ statusCode: number }>

/**
 * The only thing delivery needs from whichever registry holds the records: the ability to forget
 * an endpoint the push service reports as gone. A subscription store and the reminder registry
 * both satisfy this, so delivery stays one implementation for every topic.
 */
export interface PushSubscriptionPruner {
  remove(endpoint: string): boolean
}

export interface DeliveryResult {
  readonly endpoint: string
  readonly delivered: boolean
  /** True when the push service said the subscription no longer exists. */
  readonly expired: boolean
}

export interface DeliverySummary {
  /** Endpoints the push service rejected as gone and that were removed from the store. */
  readonly prunedEndpoints: readonly string[]
  readonly deliveredCount: number
  readonly failedCount: number
}

export interface DeliverOptions<TRecord extends PushSubscriptionRecord = PushSubscriptionRecord> {
  /** Returns the payload for a subscription, or null to skip it (for example, over the hourly cap). */
  readonly payloadFor: (record: TRecord) => PushNotificationPayload | null
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

    try {
      await sendNotification(
        { endpoint: record.endpoint, keys: record.keys },
        JSON.stringify(payload),
      )
      deliveredCount += 1
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

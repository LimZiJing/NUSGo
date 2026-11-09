import type { PushNotificationPayload, ShuttleArrivalSnapshot } from '@nusgo/shared'
import type { PushSendNotification } from './delivery.ts'
import { deliverPushNotifications } from './delivery.ts'
import type { NotificationCap } from './notification-cap.ts'
import { createServiceUpdateNotifications } from './notifications.ts'
import type { ServiceUpdate } from './service-updates.ts'
import { createServiceUpdateDetector } from './service-updates.ts'
import type { PushSubscriptionStore } from './subscription-store.ts'

export interface PublishResult {
  readonly updates: readonly ServiceUpdate[]
  readonly notificationsSent: number
  readonly prunedEndpoints: readonly string[]
}

export interface ServiceUpdatePublisherOptions {
  readonly store: PushSubscriptionStore
  readonly sendNotification: PushSendNotification
  /**
   * The process-wide hourly cap, shared with the HTTP routes so an unsubscribe or re-register
   * resets the same window that limits delivery. A private cap here would leave the route's
   * reset writing to a different instance and the enforced limit would drift.
   */
  readonly cap: NotificationCap
  /** Resolves a canonical stop name for a notification body. */
  readonly stopName: (stopId: string) => string | null
  readonly now?: () => number
}

export interface ServiceUpdatePublisher {
  /** Feeds one newly published snapshot and pushes any notification it warrants. */
  publish(snapshot: ShuttleArrivalSnapshot): Promise<PublishResult>
  /** The shared cap, exposed so composition can confirm the routes and publisher agree. */
  readonly cap: NotificationCap
}

/**
 * Chooses the one notification worth sending for a batch of detected updates.
 *
 * `payloads` is shorter than `updates` when an update was skipped for a stop the canonical data
 * no longer names, so the two lists cannot be indexed together. The caller marks which payload
 * is the largest valid one instead.
 */
function mostSignificantPayload(
  payloads: readonly PushNotificationPayload[],
  updateIndexByPayloadIndex: readonly number[],
  updates: readonly ServiceUpdate[],
): PushNotificationPayload | null {
  if (payloads.length === 0 || updateIndexByPayloadIndex.length !== payloads.length) return null
  let bestPayloadIndex = -1
  let bestDelay = -1
  payloads.forEach((_payload, payloadIndex) => {
    const update = updates[updateIndexByPayloadIndex[payloadIndex] ?? -1]
    if (!update) return
    const delay = update.kind === 'delay' ? update.delaySeconds : 0
    if (delay > bestDelay) {
      bestDelay = delay
      bestPayloadIndex = payloadIndex
    }
  })
  return bestPayloadIndex === -1 ? null : payloads[bestPayloadIndex] ?? null
}

/**
 * Turns published arrival snapshots into web pushes for the `service-updates` topic.
 *
 * It reads the snapshot the store already published, so this adds no upstream request and no
 * second poller: callers hook it to the existing refresh-complete callback.
 */
export function createServiceUpdatePublisher(
  options: ServiceUpdatePublisherOptions,
): ServiceUpdatePublisher {
  const now = options.now ?? Date.now
  const detectUpdates = createServiceUpdateDetector({ now })
  const cap = options.cap
  let previousSnapshot: ShuttleArrivalSnapshot | null = null

  const publish = async (snapshot: ShuttleArrivalSnapshot): Promise<PublishResult> => {
    const previous = previousSnapshot
    previousSnapshot = snapshot
    if (!previous) return { updates: [], notificationsSent: 0, prunedEndpoints: [] }

    const updates = detectUpdates(previous, snapshot)
    const notifications = createServiceUpdateNotifications(updates, { stopName: options.stopName })
    const payload = mostSignificantPayload(
      notifications.payloads,
      notifications.updateIndexByPayloadIndex,
      updates,
    )
    const subscriptions = options.store.list('service-updates')
    if (!payload || subscriptions.length === 0) {
      return { updates, notificationsSent: 0, prunedEndpoints: [] }
    }

    const summary = await deliverPushNotifications(options.store, options.sendNotification, subscriptions, {
      cap,
      payloadFor: () => payload,
    })

    return {
      updates,
      notificationsSent: summary.deliveredCount,
      prunedEndpoints: summary.prunedEndpoints,
    }
  }

  return { publish, cap }
}

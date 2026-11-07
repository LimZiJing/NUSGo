import type { PushNotificationPayload, ShuttleArrivalSnapshot } from '@nusgo/shared'
import type { PushConfig } from '../config.ts'
import type { PushSendNotification } from './delivery.ts'
import { deliverPushNotifications } from './delivery.ts'
import { createNotificationCap, type NotificationCap } from './notification-cap.ts'
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
  readonly push: PushConfig
  readonly sendNotification: PushSendNotification
  /** Resolves a canonical stop name for a notification body. */
  readonly stopName: (stopId: string) => string | null
  readonly now?: () => number
}

export interface ServiceUpdatePublisher {
  /** Feeds one newly published snapshot and pushes any notification it warrants. */
  publish(snapshot: ShuttleArrivalSnapshot): Promise<PublishResult>
  /** Forgets a subscription's hourly-cap history; called when someone unsubscribes. */
  forgetSubscription(endpoint: string): void
  readonly cap: NotificationCap
}

/**
 * Chooses the one notification worth sending for a batch of detected updates.
 * Sending a single update per snapshot keeps a burst of delayed buses from producing a burst
 * of notifications; the largest delay is the most useful single signal.
 */
function mostSignificantPayload(
  payloads: readonly PushNotificationPayload[],
  updates: readonly ServiceUpdate[],
): PushNotificationPayload | null {
  if (payloads.length === 0) return null
  let bestIndex = 0
  let bestDelay = -1
  updates.forEach((update, index) => {
    const delay = update.kind === 'delay' ? update.delaySeconds : 0
    if (delay > bestDelay) {
      bestDelay = delay
      bestIndex = index
    }
  })
  return payloads[bestIndex] ?? payloads[0] ?? null
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
  const cap = createNotificationCap({ maxPerHour: options.push.notificationsPerHourCap, now })
  let previousSnapshot: ShuttleArrivalSnapshot | null = null

  const publish = async (snapshot: ShuttleArrivalSnapshot): Promise<PublishResult> => {
    const previous = previousSnapshot
    previousSnapshot = snapshot
    if (!previous) return { updates: [], notificationsSent: 0, prunedEndpoints: [] }

    const updates = detectUpdates(previous, snapshot)
    const payload = mostSignificantPayload(
      createServiceUpdateNotifications(updates, { stopName: options.stopName }),
      updates,
    )
    const subscriptions = options.store.list('service-updates')
    if (!payload || subscriptions.length === 0) {
      return { updates, notificationsSent: 0, prunedEndpoints: [] }
    }

    const summary = await deliverPushNotifications(options.store, options.sendNotification, subscriptions, {
      // The hourly cap is a product rule, not a delivery failure: the subscription stays registered.
      payloadFor: (record) => (cap.tryConsume(record.endpoint) ? payload : null),
    })

    return {
      updates,
      notificationsSent: summary.deliveredCount,
      prunedEndpoints: summary.prunedEndpoints,
    }
  }

  return {
    publish,
    forgetSubscription(endpoint) {
      cap.reset(endpoint)
    },
    cap,
  }
}

import type { PushNotificationPayload } from '@nusgo/shared'
import { buildStopsViewDeepLink } from '@nusgo/shared'
import {
  MAX_ACTIVE_SERVICE_ANNOUNCEMENTS,
  type ServiceAnnouncement,
} from '../live-data/service-announcements.ts'
import type { PushSendNotification } from './delivery.ts'
import { deliverPushNotifications } from './delivery.ts'
import type { NotificationCap } from './notification-cap.ts'
import type { PushSubscriptionRecord, PushSubscriptionStore } from './subscription-store.ts'

/** The notification body is a bounded one-line excerpt of the upstream notice. */
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 120

/**
 * How many delivered announcement identities are remembered per endpoint.
 *
 * This equals the largest feed the selection can produce, so forgetting an identity can only
 * happen for a notice that is no longer active. A smaller cap would re-send a still-showing
 * notice to an endpoint that had already received it.
 */
const MAX_REMEMBERED_IDENTITIES_PER_ENDPOINT = MAX_ACTIVE_SERVICE_ANNOUNCEMENTS

const ANNOUNCEMENT_TITLE = 'Service notice'

export interface ServiceAnnouncementPublishResult {
  readonly activeCount: number
  readonly notificationsSent: number
  readonly prunedEndpoints: readonly string[]
}

export interface ServiceAnnouncementPublisherOptions {
  readonly store: PushSubscriptionStore
  readonly sendNotification: PushSendNotification
  /** The process-wide hourly cap, shared with the routes and the arrival publisher. */
  readonly cap: NotificationCap
  /** The announcements currently showing, highest priority first. */
  readonly announcements: () => readonly ServiceAnnouncement[]
  readonly now?: () => number
}

export interface ServiceAnnouncementPublisher {
  /** Offers at most one unsent announcement per endpoint for the current feed. */
  publish(): Promise<ServiceAnnouncementPublishResult>
  readonly cap: NotificationCap
}

function oneLine(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= ANNOUNCEMENT_BODY_MAX_LENGTH) return collapsed
  return collapsed.slice(0, ANNOUNCEMENT_BODY_MAX_LENGTH - 1).trimEnd() + '…'
}

/**
 * Builds the rider-facing payload. The deep link opens Stops rather than a stop, because a
 * service announcement may apply to every service and NUSGo has no canonical route-to-stop
 * mapping to choose a representative one.
 */
export function createServiceAnnouncementNotification(
  announcement: ServiceAnnouncement,
): PushNotificationPayload {
  return {
    title: ANNOUNCEMENT_TITLE,
    body: oneLine(announcement.audience.kind === 'routes'
      ? announcement.audience.routeIds.join(', ') + ': ' + announcement.message
      : announcement.message),
    url: buildStopsViewDeepLink(),
    topic: 'service-updates',
    tag: 'announcement:' + announcement.id.slice(0, 100),
  }
}

/**
 * Pushes service announcements from the NUS ticker tape.
 *
 * An identity counts as delivered only after the push service accepted it, so a transient
 * failure or a full hourly budget retries it on a later cycle. An endpoint that is already being
 * delivered to is skipped by an overlapping cycle, which keeps at most one announcement per
 * endpoint in flight. Memory is bounded by forgetting identities the feed no longer reports and
 * by dropping endpoints the store no longer holds.
 */
export function createServiceAnnouncementPublisher(
  options: ServiceAnnouncementPublisherOptions,
): ServiceAnnouncementPublisher {
  const cap = options.cap
  const now = options.now ?? Date.now
  const isActive = (announcement: ServiceAnnouncement): boolean =>
    announcement.displayFromMs <= now() && announcement.displayToMs > now()
  /** endpoint -> identities the push service accepted at least once. */
  const deliveredIdentities = new Map<string, Map<string, true>>()
  /** Endpoints a cycle is currently delivering to. */
  const inFlightEndpoints = new Set<string>()

  const wasDelivered = (endpoint: string, identity: string): boolean =>
    deliveredIdentities.get(endpoint)?.has(identity) === true

  const rememberDelivered = (endpoint: string, identity: string): void => {
    const identities = deliveredIdentities.get(endpoint) ?? new Map<string, true>()
    identities.set(identity, true)
    while (identities.size > MAX_REMEMBERED_IDENTITIES_PER_ENDPOINT) {
      const oldest = identities.keys().next()
      if (oldest.done) break
      identities.delete(oldest.value)
    }
    deliveredIdentities.set(endpoint, identities)
  }

  const pruneMemory = (subscriptions: readonly PushSubscriptionRecord[], activeIdentities: ReadonlySet<string>): void => {
    const subscribed = new Set(subscriptions.map(({ endpoint }) => endpoint))
    for (const endpoint of [...deliveredIdentities.keys()]) {
      if (!subscribed.has(endpoint)) {
        deliveredIdentities.delete(endpoint)
        continue
      }
      const identities = deliveredIdentities.get(endpoint)
      if (!identities) continue
      for (const identity of [...identities.keys()]) {
        if (!activeIdentities.has(identity)) identities.delete(identity)
      }
      if (identities.size === 0) deliveredIdentities.delete(endpoint)
    }
    for (const endpoint of [...inFlightEndpoints]) {
      if (!subscribed.has(endpoint)) inFlightEndpoints.delete(endpoint)
    }
  }

  const publish = async (): Promise<ServiceAnnouncementPublishResult> => {
    const active = options.announcements().filter(isActive)
    const subscriptions = options.store.list('service-updates')
    pruneMemory(subscriptions, new Set(active.map(({ identity }) => identity)))

    if (active.length === 0 || subscriptions.length === 0) {
      return { activeCount: active.length, notificationsSent: 0, prunedEndpoints: [] }
    }

    const selected = new Map<string, ServiceAnnouncement>()
    for (const { endpoint } of subscriptions) {
      if (inFlightEndpoints.has(endpoint)) continue
      // Highest priority first, and only announcements this endpoint has not been sent.
      const candidate = active.find((announcement) => !wasDelivered(endpoint, announcement.identity))
      if (candidate) selected.set(endpoint, candidate)
    }
    if (selected.size === 0) {
      return { activeCount: active.length, notificationsSent: 0, prunedEndpoints: [] }
    }

    const payloads = new Map<string, PushNotificationPayload>()
    for (const [endpoint, announcement] of selected) {
      inFlightEndpoints.add(endpoint)
      payloads.set(endpoint, createServiceAnnouncementNotification(announcement))
    }

    let summary
    try {
      summary = await deliverPushNotifications(options.store, options.sendNotification, subscriptions, {
        cap,
        payloadFor: (record) => {
          const announcement = selected.get(record.endpoint)
          // Recheck queued work after earlier sends: the rider may have opted out, or the
          // notice's display window may have ended while another push was in flight.
          if (!announcement || !isActive(announcement) || options.store.get(record.endpoint) !== record) return null
          return payloads.get(record.endpoint) ?? null
        },
        onDelivered: (record) => {
          const announcement = selected.get(record.endpoint)
          if (announcement) rememberDelivered(record.endpoint, announcement.identity)
        },
      })
    } finally {
      // A refused reservation, a transient failure, or a pruned subscription all leave the
      // identity unsent, so a later cycle retries it.
      for (const endpoint of selected.keys()) inFlightEndpoints.delete(endpoint)
    }

    return {
      activeCount: active.length,
      notificationsSent: summary.deliveredCount,
      prunedEndpoints: summary.prunedEndpoints,
    }
  }

  return { publish, cap }
}

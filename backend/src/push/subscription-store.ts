import type {
  PushNotificationTopic,
  PushSubscriptionKeys,
} from '@nusgo/shared'

export interface PushSubscriptionRecord {
  readonly endpoint: string
  readonly keys: PushSubscriptionKeys
  readonly topic: PushNotificationTopic
  /**
   * Present only for reminder subscriptions: the stop and route this endpoint asked about.
   * It is still canonical stop and route ids only, never a location, a journey or an identity.
   */
  readonly watch?: { readonly stopId: string; readonly routeId: string }
}

export interface PushSubscriptionStore {
  /** Adds or replaces a subscription. Re-subscribing the same endpoint updates its keys and topic. */
  add(record: PushSubscriptionRecord): void
  remove(endpoint: string): boolean
  get(endpoint: string): PushSubscriptionRecord | null
  list(topic?: PushNotificationTopic): readonly PushSubscriptionRecord[]
  readonly size: number
}

export interface PushSubscriptionStoreOptions {
  /**
   * Bounds memory for a single Express process. Oldest registrations are evicted first so a
   * flood of endpoints cannot grow this store without limit.
   */
  readonly maxSubscriptions?: number
  readonly now?: () => number
}

export const DEFAULT_MAX_PUSH_SUBSCRIPTIONS = 5_000

/**
 * In-memory subscription store behind a small interface.
 *
 * The read model is deliberately narrow — endpoint, keys, topic and optionally a reminder's
 * watch target — so a feature such as alight reminders (#503) adds its own topic and delivery
 * rules without changing this contract or learning anything personal about a subscriber.
 *
 * The interface is what #503 builds on. A second implementation can persist the same records
 * elsewhere; nothing above this seam depends on where the records live.
 */
export function createPushSubscriptionStore(
  options: PushSubscriptionStoreOptions = {},
): PushSubscriptionStore {
  const maxSubscriptions = options.maxSubscriptions ?? DEFAULT_MAX_PUSH_SUBSCRIPTIONS
  // Map iteration preserves insertion order, which makes the oldest registration the first key.
  const records = new Map<string, PushSubscriptionRecord>()

  return {
    add(record) {
      // Delete first so a refreshed subscription moves to the newest position.
      records.delete(record.endpoint)
      if (records.size >= maxSubscriptions) {
        const oldestEndpoint = records.keys().next().value
        if (oldestEndpoint !== undefined) records.delete(oldestEndpoint)
      }
      records.set(record.endpoint, {
        endpoint: record.endpoint,
        keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
        topic: record.topic,
        // Copying the watch explicitly keeps a caller's object from mutating a stored record.
        ...(record.watch ? { watch: { stopId: record.watch.stopId, routeId: record.watch.routeId } } : {}),
      })
    },
    remove(endpoint) {
      return records.delete(endpoint)
    },
    get(endpoint) {
      return records.get(endpoint) ?? null
    },
    list(topic) {
      const all = [...records.values()]
      return topic ? all.filter((record) => record.topic === topic) : all
    },
    get size() {
      return records.size
    },
  }
}

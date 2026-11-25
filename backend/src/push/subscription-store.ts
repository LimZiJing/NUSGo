import type {
  PushNotificationTopic,
  PushSubscriptionKeys,
} from '@nusgo/shared'

export interface PushSubscriptionRecord {
  readonly endpoint: string
  readonly keys: PushSubscriptionKeys
  readonly topic: PushNotificationTopic
}

export interface PushSubscriptionStore {
  /** Replaces an existing endpoint or admits a new one; false means capacity is exhausted. */
  add(record: PushSubscriptionRecord): boolean
  remove(endpoint: string): boolean
  get(endpoint: string): PushSubscriptionRecord | null
  list(topic?: PushNotificationTopic): readonly PushSubscriptionRecord[]
  readonly size: number
}

export interface PushSubscriptionStoreOptions {
  /**
   * Bounds memory for a single Express process. New endpoints are rejected at capacity so
   * anonymous enrollment cannot evict existing riders.
   */
  readonly maxSubscriptions?: number
  readonly now?: () => number
}

export const DEFAULT_MAX_PUSH_SUBSCRIPTIONS = 5_000

/**
 * In-memory subscription store behind a small interface.
 *
 * The read model is deliberately narrow — endpoint, keys and topic only — so a feature such as
 * alight reminders (#503) adds its own topic, its own registry and its own delivery rules without
 * changing this contract or learning anything personal about a subscriber.
 *
 * The interface is what #503 builds alongside: a reminder keeps its watch and lead time in the
 * separate reminder registry, because a browser holds one endpoint and this store keeps one
 * record per endpoint. No second implementation is needed for reminders.
 */
export function createPushSubscriptionStore(
  options: PushSubscriptionStoreOptions = {},
): PushSubscriptionStore {
  const maxSubscriptions = options.maxSubscriptions ?? DEFAULT_MAX_PUSH_SUBSCRIPTIONS
  const records = new Map<string, PushSubscriptionRecord>()

  return {
    add(record) {
      if (!records.has(record.endpoint) && records.size >= maxSubscriptions) return false
      records.set(record.endpoint, {
        endpoint: record.endpoint,
        keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
        topic: record.topic,
      })
      return true
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

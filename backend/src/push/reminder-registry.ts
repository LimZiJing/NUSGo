import type { PushSubscriptionRecord } from './subscription-store.ts'

export interface AlightReminderRecord extends PushSubscriptionRecord {
  readonly topic: 'alight-reminders'
  /** Required here: a reminder without a watch target could never be evaluated. */
  readonly watch: { readonly stopId: string; readonly routeId: string }
}

export interface AlightReminderRegistry {
  /** Adds or replaces the watch for one endpoint. One endpoint watches one stop and route. */
  upsert(record: AlightReminderRecord): void
  remove(endpoint: string): boolean
  get(endpoint: string): AlightReminderRecord | null
  list(): readonly AlightReminderRecord[]
  readonly size: number
}

export interface AlightReminderRegistryOptions {
  /** Bounds memory for a single process; the oldest watch is evicted first. */
  readonly maxReminders?: number
}

export const DEFAULT_MAX_ALIGHT_REMINDERS = 5_000

function copyRecord(record: AlightReminderRecord): AlightReminderRecord {
  return {
    endpoint: record.endpoint,
    keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
    topic: 'alight-reminders',
    // Copying the watch keeps a caller's later mutation from changing a stored reminder.
    watch: { stopId: record.watch.stopId, routeId: record.watch.routeId },
  }
}

/**
 * Reminders live in their own narrow registry rather than in the push subscription store.
 *
 * A browser holds one push endpoint, and #502's store keeps one record per endpoint; sharing it
 * would mean registering a reminder silently replaced the rider's service-update subscription.
 * This registry keys the same endpoint separately, so both topics can be active at once, while
 * the stored record type stays the one #502 defined — stop and route ids only, never an identity,
 * a device fingerprint, a journey or a position.
 */
export function createAlightReminderRegistry(
  options: AlightReminderRegistryOptions = {},
): AlightReminderRegistry {
  const maxReminders = options.maxReminders ?? DEFAULT_MAX_ALIGHT_REMINDERS
  const records = new Map<string, AlightReminderRecord>()

  return {
    upsert(record) {
      // Delete first so a refreshed watch moves to the newest position and is evicted last.
      records.delete(record.endpoint)
      if (records.size >= maxReminders) {
        const oldestEndpoint = records.keys().next().value
        if (oldestEndpoint !== undefined) records.delete(oldestEndpoint)
      }
      records.set(record.endpoint, copyRecord(record))
    },
    remove(endpoint) {
      return records.delete(endpoint)
    },
    get(endpoint) {
      return records.get(endpoint) ?? null
    },
    list() {
      return [...records.values()]
    },
    get size() {
      return records.size
    },
  }
}

/** Structural check that a record carries everything a reminder needs. */
export function toAlightReminderRecord(
  record: PushSubscriptionRecord,
): AlightReminderRecord | null {
  if (record.topic !== 'alight-reminders' || !record.watch) return null
  return copyRecord(record as AlightReminderRecord)
}

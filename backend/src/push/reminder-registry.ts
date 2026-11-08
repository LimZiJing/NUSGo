import type { PushReminderLeadTimeSeconds, PushReminderTarget } from '@nusgo/shared'
import type { PushSubscriptionRecord } from './subscription-store.ts'

/** How long one reminder may live before the server forgets it. Matches the #503 example. */
export const DEFAULT_ALIGHT_REMINDER_TTL_MS = 2 * 60 * 60_000

/** What a registration asks for; every timestamp and the generation belong to the registry. */
export interface AlightReminderRegistration extends PushSubscriptionRecord {
  readonly topic: 'alight-reminders'
  /** Required here: a reminder without a watch target could never be evaluated. */
  readonly watch: PushReminderTarget
  readonly leadTimeSeconds: PushReminderLeadTimeSeconds
}

export interface AlightReminderRecord extends AlightReminderRegistration {
  /** Server time the watch was accepted. */
  readonly createdAtMs: number
  /** Server time after which the watch is removed and can never push again. */
  readonly expiresAtMs: number
  /**
   * Identity of one registration for an endpoint. A delivery that was already in flight when the
   * rider removed or replaced the watch must not delete the newer record.
   */
  readonly generation: number
}

export interface AlightReminderRegistry {
  /** Adds or refreshes one watch. Returns null for a new endpoint at capacity; incumbents remain. */
  upsert(registration: AlightReminderRegistration): AlightReminderRecord | null
  remove(endpoint: string): boolean
  /**
   * Removes the watch only while it is still the record a caller acted on. Returns false when the
   * endpoint now holds a newer watch, an expired one, or none at all.
   */
  removeIfCurrent(endpoint: string, generation: number): boolean
  /** Drops expired watches and returns the endpoints removed. */
  pruneExpired(): readonly string[]
  /** Never returns an expired watch; reading also removes one that has expired. */
  get(endpoint: string): AlightReminderRecord | null
  /** Never returns expired watches; listing also removes any that have expired. */
  list(): readonly AlightReminderRecord[]
  readonly size: number
}

export interface AlightReminderRegistryOptions {
  /** Bounds memory for a single process; new endpoints are rejected when full. */
  readonly maxReminders?: number
  readonly ttlMs?: number
  readonly now?: () => number
}

export const DEFAULT_MAX_ALIGHT_REMINDERS = 5_000

function copyRecord(record: AlightReminderRecord): AlightReminderRecord {
  return {
    endpoint: record.endpoint,
    keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
    topic: 'alight-reminders',
    // Copying the watch keeps a caller's later mutation from changing a stored reminder.
    watch: { stopId: record.watch.stopId, routeId: record.watch.routeId },
    leadTimeSeconds: record.leadTimeSeconds,
    createdAtMs: record.createdAtMs,
    expiresAtMs: record.expiresAtMs,
    generation: record.generation,
  }
}

/**
 * Reminders live in their own narrow registry rather than in the push subscription store.
 *
 * A browser holds one push endpoint, and #502's store keeps one record per endpoint; sharing it
 * would mean registering a reminder silently replaced the rider's service-update subscription.
 * This registry keys the same endpoint separately, so both topics can be active at once, while
 * the stored record stays the same narrow shape — stop and route ids, a lead time and the two
 * server-owned timestamps. Never an identity, a device fingerprint, a journey or a position.
 *
 * Expiry is enforced on every read as well as by `pruneExpired`: a watch past its deadline is
 * gone even if the publisher never runs, so it cannot push from a stale snapshot later.
 */
export function createAlightReminderRegistry(
  options: AlightReminderRegistryOptions = {},
): AlightReminderRegistry {
  const maxReminders = options.maxReminders ?? DEFAULT_MAX_ALIGHT_REMINDERS
  const ttlMs = options.ttlMs ?? DEFAULT_ALIGHT_REMINDER_TTL_MS
  const now = options.now ?? Date.now
  const records = new Map<string, AlightReminderRecord>()
  let lastGeneration = 0

  const isExpired = (record: AlightReminderRecord, atMs: number): boolean => record.expiresAtMs <= atMs

  const dropExpired = (atMs: number): string[] => {
    const removed: string[] = []
    for (const [endpoint, record] of records) {
      if (!isExpired(record, atMs)) continue
      records.delete(endpoint)
      removed.push(endpoint)
    }
    return removed
  }

  return {
    upsert(registration) {
      const createdAtMs = now()
      dropExpired(createdAtMs)
      if (!records.has(registration.endpoint) && records.size >= maxReminders) return null
      lastGeneration += 1
      const record: AlightReminderRecord = {
        endpoint: registration.endpoint,
        keys: { p256dh: registration.keys.p256dh, auth: registration.keys.auth },
        topic: 'alight-reminders',
        watch: { stopId: registration.watch.stopId, routeId: registration.watch.routeId },
        leadTimeSeconds: registration.leadTimeSeconds,
        createdAtMs,
        expiresAtMs: createdAtMs + ttlMs,
        generation: lastGeneration,
      }
      records.set(record.endpoint, record)
      return copyRecord(record)
    },
    remove(endpoint) {
      return records.delete(endpoint)
    },
    removeIfCurrent(endpoint, generation) {
      const current = records.get(endpoint)
      if (!current || current.generation !== generation) return false
      // An expired record is already gone as far as callers can observe; drop it either way.
      records.delete(endpoint)
      return true
    },
    pruneExpired() {
      return dropExpired(now())
    },
    get(endpoint) {
      const record = records.get(endpoint)
      if (!record) return null
      if (isExpired(record, now())) {
        records.delete(endpoint)
        return null
      }
      return copyRecord(record)
    },
    list() {
      dropExpired(now())
      return [...records.values()].map(copyRecord)
    },
    get size() {
      dropExpired(now())
      return records.size
    },
  }
}

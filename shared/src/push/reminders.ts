/**
 * Alight-reminder wire contract shared by the browser adapter and the Express routes.
 *
 * A reminder says only "this endpoint watches stop X on route Y". It carries no identity, no
 * device fingerprint, no saved journey and no location, so the server can evaluate reminders
 * without ever learning who the rider is or where they are.
 */
import type { PushNotificationTopic } from './notifications.ts'
import {
  normalizePushEndpoint,
  normalizePushKey,
  type PushSubscriptionKeys,
} from './subscriptions.ts'

/** The one topic reminder records use; kept as a literal so record shapes stay narrow. */
export type PushReminderTopic = Extract<PushNotificationTopic, 'alight-reminders'>

export const PUSH_REMINDER_TOPIC: PushReminderTopic = 'alight-reminders'

/** Stop and route identifiers are short canonical ids such as `COM3` or `TCOMS-OPP`. */
export const PUSH_REMINDER_ID_MAX_LENGTH = 32

const REMINDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface PushReminderTarget {
  readonly stopId: string
  readonly routeId: string
}

export interface PushReminderRegistration {
  readonly endpoint: string
  readonly keys: PushSubscriptionKeys
  readonly topic: PushReminderTopic
  /** The single stop and route this endpoint asked to be reminded about. */
  readonly watch: PushReminderTarget
}

export interface PushReminderRequest {
  /** The endpoint to remind. Removal needs nothing else, because the server stores no identity. */
  readonly endpoint: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeReminderId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (id.length === 0 || id.length > PUSH_REMINDER_ID_MAX_LENGTH) return null
  return REMINDER_ID_PATTERN.test(id) ? id : null
}

/**
 * Reads `{stopId, routeId}` from untrusted input.
 *
 * Both halves are validated here rather than trusted from the client, so a reminder can never be
 * stored against an id shape that the evaluator would then fail to match.
 */
export function parsePushReminderTarget(input: unknown): PushReminderTarget | null {
  if (!isRecord(input)) return null
  const stopId = normalizeReminderId(input.stopId)
  const routeId = normalizeReminderId(input.routeId)
  if (!stopId || !routeId) return null
  return { stopId, routeId }
}

/**
 * Validates a reminder registration. The topic is pinned rather than read from the body so a
 * caller cannot register a stop watch under the service-updates topic.
 */
export function parsePushReminderRegistration(input: unknown): PushReminderRegistration | null {
  if (!isRecord(input) || !isRecord(input.keys)) return null
  const endpoint = normalizePushEndpoint(input.endpoint)
  const p256dh = normalizePushKey(input.keys.p256dh)
  const auth = normalizePushKey(input.keys.auth)
  const watch = parsePushReminderTarget(input.watch)
  if (!endpoint || !p256dh || !auth || !watch) return null
  return { endpoint, keys: { p256dh, auth }, topic: PUSH_REMINDER_TOPIC, watch }
}

export function parsePushReminderRequest(input: unknown): string | null {
  if (!isRecord(input)) return null
  return normalizePushEndpoint(input.endpoint)
}

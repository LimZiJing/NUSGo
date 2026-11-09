/**
 * Alight-reminder wire contract shared by the browser adapter and the Express routes.
 *
 * A reminder says only "this endpoint watches stop X on route Y, about N seconds before the live
 * ETA". It carries no identity, no device fingerprint, no saved journey and no location, so the
 * server can evaluate reminders without ever learning who the rider is or where they are. The
 * lead time is part of the contract because the rider chooses it and the server must evaluate the
 * watch with the same value the rider was shown.
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

/**
 * The lead times a rider may choose, in seconds before the live ETA, smallest first.
 *
 * A short bounded list keeps the option meaningful: "arriving now" only helps if the rider is
 * already near the stop, and a long lead time makes the promise approximate beyond usefulness.
 */
export const PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS = [60, 120, 180] as const

export type PushReminderLeadTimeSeconds = (typeof PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS)[number]

/** Two minutes, matching the example in #503 and the lead time the control offers by default. */
export const DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS: PushReminderLeadTimeSeconds = 120

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
  /** How long before the live ETA the rider wants to be told. */
  readonly leadTimeSeconds: PushReminderLeadTimeSeconds
}

export interface PushReminderRequest {
  /** The endpoint to remind. Removal needs nothing else, because the server stores no identity. */
  readonly endpoint: string
}

/**
 * What the server stored. The expiry is server-assigned, so the rider can see the same trusted
 * deadline the evaluator enforces rather than a value computed on the device.
 */
export interface PushReminderResponse {
  readonly topic: PushReminderTopic
  readonly leadTimeSeconds: PushReminderLeadTimeSeconds
  /** ISO-8601 instant after which the watch is removed and can never push again. */
  readonly expiresAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True only for a lead time in the offered set, so an off-list value is rejected, not rounded. */
export function isPushReminderLeadTimeSeconds(value: unknown): value is PushReminderLeadTimeSeconds {
  return typeof value === 'number' &&
    (PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS as readonly number[]).includes(value)
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
 * caller cannot register a stop watch under the service-updates topic. An omitted lead time takes
 * the default; a supplied one must be one of the offered choices.
 */
export function parsePushReminderRegistration(input: unknown): PushReminderRegistration | null {
  if (!isRecord(input) || !isRecord(input.keys)) return null
  const endpoint = normalizePushEndpoint(input.endpoint)
  const p256dh = normalizePushKey(input.keys.p256dh)
  const auth = normalizePushKey(input.keys.auth)
  const watch = parsePushReminderTarget(input.watch)
  const leadTimeSeconds = input.leadTimeSeconds === undefined
    ? DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS
    : isPushReminderLeadTimeSeconds(input.leadTimeSeconds)
      ? input.leadTimeSeconds
      : null
  if (!endpoint || !p256dh || !auth || !watch || leadTimeSeconds === null) return null
  return { endpoint, keys: { p256dh, auth }, topic: PUSH_REMINDER_TOPIC, watch, leadTimeSeconds }
}

export function parsePushReminderRequest(input: unknown): string | null {
  if (!isRecord(input)) return null
  return normalizePushEndpoint(input.endpoint)
}

/**
 * Validates the registration acknowledgement. The browser uses the echoed lead time when it is
 * valid and otherwise falls back to what it asked for, so a proxy or older server cannot make the
 * stored choice disagree with the sent one.
 */
export function parsePushReminderResponse(input: unknown): PushReminderResponse | null {
  if (!isRecord(input)) return null
  if (input.topic !== PUSH_REMINDER_TOPIC) return null
  if (!isPushReminderLeadTimeSeconds(input.leadTimeSeconds)) return null
  if (typeof input.expiresAt !== 'string' || input.expiresAt.length > 64) return null
  if (!Number.isFinite(Date.parse(input.expiresAt))) return null
  return {
    topic: input.topic,
    leadTimeSeconds: input.leadTimeSeconds,
    expiresAt: input.expiresAt,
  }
}

/**
 * Push-subscription wire contract shared by the browser client and the Express routes.
 * A subscription carries only delivery details and the chosen topic; it holds no personal data.
 */
import { PUSH_NOTIFICATION_TOPICS, type PushNotificationTopic } from './notifications.ts'

export interface PushSubscriptionKeys {
  /** The client's P-256 public key, base64url encoded. */
  readonly p256dh: string
  /** The client's authentication secret, base64url encoded. */
  readonly auth: string
}

export interface PushSubscriptionRegistration {
  readonly endpoint: string
  readonly keys: PushSubscriptionKeys
  readonly topic: PushNotificationTopic
}

export interface PushSubscriptionResponse {
  readonly topic: PushNotificationTopic
}

export interface PushSubscriptionUnsubscribeRequest {
  readonly endpoint: string
}

export interface PushPublicKeyResponse {
  /** Base64url encoded VAPID public key, or null when the deployment has no push keys. */
  readonly publicKey: string | null
}

export const PUSH_ENDPOINT_MAX_LENGTH = 1024
export const PUSH_KEY_MAX_LENGTH = 200
export const PUSH_SUBSCRIPTION_BODY_MAX_BYTES = 2048

// Push services use HTTPS only. Rejecting anything else keeps the server from posting
// notifications to arbitrary hosts supplied by a client.
const PUSH_ENDPOINT_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/

export function isPushNotificationTopic(value: unknown): value is PushNotificationTopic {
  return typeof value === 'string' && (PUSH_NOTIFICATION_TOPICS as readonly string[]).includes(value)
}

export function normalizePushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const endpoint = value.trim()
  if (endpoint.length === 0 || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return null
  if (!PUSH_ENDPOINT_PATTERN.test(endpoint)) return null
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function normalizePushKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim()
  if (key.length === 0 || key.length > PUSH_KEY_MAX_LENGTH) return null
  return BASE64URL_PATTERN.test(key) ? key : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePushSubscriptionRegistration(input: unknown): PushSubscriptionRegistration | null {
  if (!isRecord(input) || !isRecord(input.keys)) return null
  const endpoint = normalizePushEndpoint(input.endpoint)
  const p256dh = normalizePushKey(input.keys.p256dh)
  const auth = normalizePushKey(input.keys.auth)
  const topic = input.topic
  if (!endpoint || !p256dh || !auth || !isPushNotificationTopic(topic)) return null
  return { endpoint, keys: { p256dh, auth }, topic }
}

/** Removing a subscription needs only the endpoint, which identifies the record. */
export function parsePushSubscriptionUnsubscribeRequest(input: unknown): string | null {
  if (!isRecord(input)) return null
  return normalizePushEndpoint(input.endpoint)
}

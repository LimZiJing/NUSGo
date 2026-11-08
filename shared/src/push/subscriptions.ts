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

/**
 * Push services this deployment is willing to POST to.
 *
 * Registration matches these hosts exactly. A suffix or wildcard rule would accept a lookalike
 * such as `fcm.googleapis.com.attacker.test` and turn a client-supplied endpoint into a
 * server-side request to an arbitrary host. Edge's legacy WNS endpoints use per-tenant
 * subdomains, so they are deliberately unsupported rather than matched loosely.
 */
export const PUSH_SERVICE_HOSTS = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])

// Push services use HTTPS only, and the pattern keeps the value ASCII with no whitespace or
// control characters before it reaches URL parsing. Rejecting anything else keeps the server
// from posting notifications to arbitrary hosts supplied by a client.
const PUSH_ENDPOINT_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/
const IPV4_LITERAL_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

export function isPushNotificationTopic(value: unknown): value is PushNotificationTopic {
  return typeof value === 'string' && (PUSH_NOTIFICATION_TOPICS as readonly string[]).includes(value)
}

function parseHttpsEndpoint(endpoint: string): URL | null {
  if (endpoint.length === 0 || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return null
  if (!PUSH_ENDPOINT_PATTERN.test(endpoint)) return null
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

/** A hostname the server must never dial: an IP literal or a local-only name. */
function isLocalHostname(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (IPV4_LITERAL_PATTERN.test(name) || name.includes(':')) return true
  return name === 'localhost' || name.endsWith('.localhost') ||
    name.endsWith('.local') || name.endsWith('.internal') || !name.includes('.')
}

/**
 * Validates an endpoint for a new subscription: an exact supported push-service host on the
 * default HTTPS port. Anything else is rejected here, before it can be stored or dialled.
 */
export function normalizePushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = parseHttpsEndpoint(value.trim())
  if (!url) return null
  // A custom port would let a caller aim the sender at another service on the same host.
  if (url.port !== '') return null
  if (!PUSH_SERVICE_HOSTS.includes(url.hostname)) return null
  return url.toString()
}

/**
 * Validates an endpoint used only as a store key when unsubscribing.
 *
 * Removal never dials the endpoint, so it accepts any public HTTPS endpoint rather than only the
 * registration allowlist. That keeps unsubscribing working for records stored before the
 * allowlist existed, without widening what may be registered or contacted.
 */
export function normalizePushRemovalEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = parseHttpsEndpoint(value.trim())
  if (!url || isLocalHostname(url.hostname)) return null
  return url.toString()
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
  return normalizePushRemovalEndpoint(input.endpoint)
}

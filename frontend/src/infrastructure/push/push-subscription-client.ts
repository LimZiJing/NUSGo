import { buildApiUrl } from '../api/api-url'
import type { PushNotificationTopic } from '@nusgo/shared/push/notifications'
import type {
  PushSubscriptionRegistration,
  PushSubscriptionUnsubscribeRequest,
} from '@nusgo/shared/push/subscriptions'

export interface PushSubscriptionClient {
  /** Reads the deployment's VAPID public key; null means push is unavailable. */
  getPublicKey(signal?: AbortSignal): Promise<string | null>
  register(registration: PushSubscriptionRegistration, signal?: AbortSignal): Promise<void>
  unregister(endpoint: string, signal?: AbortSignal): Promise<void>
}

interface PushSubscriptionClientOptions {
  readonly apiOrigin?: string
  readonly fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createPushSubscriptionClient(
  options: PushSubscriptionClientOptions = {},
): PushSubscriptionClient {
  const fetcher = options.fetcher ?? fetch
  const publicKeyUrl = buildApiUrl('/api/push/public-key', options.apiOrigin)
  const subscriptionsUrl = buildApiUrl('/api/push/subscriptions', options.apiOrigin)
  const removeUrl = buildApiUrl('/api/push/subscriptions/remove', options.apiOrigin)

  const post = async (url: string, body: unknown, signal?: AbortSignal): Promise<Response> => {
    return fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  }

  return {
    async getPublicKey(signal) {
      const response = await fetcher(publicKeyUrl, { signal })
      if (!response.ok) throw new Error(`push public key request failed: ${response.status}`)
      const body = await response.json() as unknown
      if (!isRecord(body) || (body.publicKey !== null && typeof body.publicKey !== 'string')) {
        throw new Error('push public key response was invalid')
      }
      const { publicKey } = body
      return typeof publicKey === 'string' && publicKey.length > 0 ? publicKey : null
    },
    async register(registration, signal) {
      const response = await post(subscriptionsUrl, registration, signal)
      if (!response.ok) throw new Error(`push subscription request failed: ${response.status}`)
    },
    async unregister(endpoint, signal) {
      const body: PushSubscriptionUnsubscribeRequest = { endpoint }
      const response = await post(removeUrl, body, signal)
      // 404 means the server had already forgotten it, which is the outcome the caller wants.
      if (!response.ok && response.status !== 404) {
        throw new Error(`push unsubscribe request failed: ${response.status}`)
      }
    },
  }
}

/** Converts a browser PushSubscription into the wire shape the backend stores. */
export function toPushSubscriptionRegistration(
  subscription: { readonly endpoint?: string; readonly keys?: { readonly p256dh?: string; readonly auth?: string } },
  topic: PushNotificationTopic = 'service-updates',
): PushSubscriptionRegistration | null {
  const endpoint = subscription.endpoint
  const p256dh = subscription.keys?.p256dh
  const auth = subscription.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, keys: { p256dh, auth }, topic }
}

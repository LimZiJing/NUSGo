import {
  PushSubscriptionError,
  PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY,
  type EnablePushResult,
  type PushEnvironment,
  type PushNotificationService,
  type PushPermission,
  type PushPreference,
} from '../../domain/push/push-notifications'
import type { PushSubscriptionClient } from './push-subscription-client'
import {
  createPushSubscriptionClient,
  toPushSubscriptionRegistration,
} from './push-subscription-client'

export type {
  PushAvailability,
  EnablePushResult,
  PushEnvironment,
  PushNotificationService,
  PushPermission,
  PushPreference,
} from '../../domain/push/push-notifications'
export { PushSubscriptionError, PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY }

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const safariStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return safariStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPad reports a desktop user agent, so an Apple touch device is also treated as iOS.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * Reports what this browser can do before anyone asks for permission.
 *
 * On iOS the Push API is only exposed to an app added to the Home Screen, so a browser tab has
 * no `PushManager` even though the installed app would. That case is reported separately so the
 * UI can explain the fix instead of claiming the device cannot receive notifications.
 */
export function getPushEnvironment(): PushEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { availability: 'unsupported', permission: 'denied' }
  }

  const permission = typeof Notification === 'undefined'
    ? 'denied'
    : Notification.permission === 'granted' || Notification.permission === 'denied'
      ? Notification.permission
      : 'default'
  const hasPushApi = 'serviceWorker' in navigator && 'PushManager' in window

  if (!hasPushApi) {
    return { availability: isIos() && !isStandalone() ? 'needs-home-screen' : 'unsupported', permission }
  }
  return { availability: 'available', permission }
}

function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export function readPushPreference(): PushPreference | null {
  try {
    const stored = window.localStorage.getItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { topic, endpoint } = parsed as { topic?: unknown; endpoint?: unknown }
    if (topic !== 'service-updates' || typeof endpoint !== 'string' || endpoint.length === 0) return null
    return { topic, endpoint }
  } catch {
    return null
  }
}

export function savePushPreference(preference: PushPreference | null): void {
  try {
    if (!preference) window.localStorage.removeItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY)
    else window.localStorage.setItem(PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // The toggle still reflects the current session when storage is unavailable.
  }
}

/* PushSubscriptionError now lives in the domain contract so features can type against it. */

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // registerPwaServiceWorker only registers in production, so a browser in development without
  // a worker is told push is unavailable rather than failing with an obscure browser error.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new PushSubscriptionError('not-installed')
  return registration
}

async function requestPermission(): Promise<PushPermission> {
  // Only ever called from a user action: requesting permission on load is both against browser
  // guidance and usually auto-denied.
  try {
    return await Notification.requestPermission() === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/* EnablePushResult is declared in the domain contract. */

/**
 * Subscribes this browser to service updates.
 *
 * The order matters: the explanation is shown by the UI first, then this call requests
 * permission, then a subscription is created and finally sent to the server. A permission
 * refusal leaves the previous preference untouched.
 */
export async function enablePush(
  client: PushSubscriptionClient,
  previous: PushPreference | null = null,
): Promise<EnablePushResult> {
  const permission = await requestPermission()
  if (permission !== 'granted') return { preference: previous, permission }

  const publicKey = await client.getPublicKey()
  if (!publicKey) throw new PushSubscriptionError('not-configured')

  const registration = await getRegistration()
  const applicationServerKey = base64UrlToUint8Array(publicKey)
  let subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const existingKey = subscription.options.applicationServerKey
    const existingBytes = existingKey ? new Uint8Array(existingKey) : null
    // A subscription is bound to its original VAPID key; re-registering cannot rotate it.
    const matchesKey = existingBytes?.length === applicationServerKey.length &&
      existingBytes.every((byte, index) => byte === applicationServerKey[index])
    if (!matchesKey) {
      await client.unregister(subscription.endpoint)
      if (!await subscription.unsubscribe()) throw new PushSubscriptionError('invalid-subscription')
      subscription = null
    }
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })
  const wireSubscription = subscription.toJSON()
  const registrationBody = toPushSubscriptionRegistration(wireSubscription)
  if (!registrationBody) throw new PushSubscriptionError('invalid-subscription')

  await client.register(registrationBody)
  const preference: PushPreference = { topic: registrationBody.topic, endpoint: registrationBody.endpoint }
  savePushPreference(preference)
  return { preference, permission }
}

/**
 * Unsubscribes this browser and forgets it on the server.
 *
 * Remove both the saved and current endpoints before cancelling the browser subscription.
 * A failed server removal retains the saved preference for retry, including when the browser
 * has refreshed its endpoint since enrollment.
 */
export async function disablePush(client: PushSubscriptionClient): Promise<PushPreference | null> {
  const preference = readPushPreference()
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  const endpoint = subscription?.endpoint ?? preference?.endpoint ?? null

  if (preference?.endpoint && preference.endpoint !== endpoint) {
    await client.unregister(preference.endpoint)
  }
  if (endpoint) await client.unregister(endpoint)
  await subscription?.unsubscribe()
  savePushPreference(null)
  return null
}

/**
 * Wraps this runtime behind the domain port so app composition can hand it to Settings.
 *
 * The HTTP client is created here and stays private, which is what keeps features free of any
 * infrastructure import.
 */
export function createPushNotificationService(
  client: PushSubscriptionClient = createPushSubscriptionClient(),
): PushNotificationService {
  return {
    getEnvironment: getPushEnvironment,
    readPreference: readPushPreference,
    enable: (previous = null) => enablePush(client, previous),
    disable: () => disablePush(client),
  }
}

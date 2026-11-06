import {
  PushSubscriptionError,
  PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY,
  ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY,
  type EnablePushResult,
  type EnableReminderResult,
  type PushEnvironment,
  type PushNotificationService,
  type PushPermission,
  type PushPreference,
  type ReminderPreference,
} from '../../domain/push/push-notifications'
import type { PushReminderTarget } from '@nusgo/shared/push/reminders'
import type { PushSubscriptionClient } from './push-subscription-client'
import {
  createPushSubscriptionClient,
  toPushReminderRegistration,
  toPushSubscriptionRegistration,
} from './push-subscription-client'

export type {
  PushAvailability,
  EnablePushResult,
  EnableReminderResult,
  PushEnvironment,
  PushNotificationService,
  PushPermission,
  PushPreference,
  ReminderPreference,
} from '../../domain/push/push-notifications'
export { PushSubscriptionError, PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY, ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY }

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

/**
 * Reads the saved reminder. A record that no longer has a stop, a route and an endpoint is
 * discarded rather than half-restored, so the control never claims a watch the server cannot hold.
 */
export function readReminderPreference(): ReminderPreference | null {
  try {
    const stored = window.localStorage.getItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { stopId, routeId, endpoint } = parsed as {
      stopId?: unknown
      routeId?: unknown
      endpoint?: unknown
    }
    if (
      typeof stopId !== 'string' || stopId.length === 0 ||
      typeof routeId !== 'string' || routeId.length === 0 ||
      typeof endpoint !== 'string' || endpoint.length === 0
    ) {
      return null
    }
    return { stopId, routeId, endpoint }
  } catch {
    return null
  }
}

export function saveReminderPreference(preference: ReminderPreference | null): void {
  try {
    if (!preference) window.localStorage.removeItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY)
    else window.localStorage.setItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // The control still reflects the current session when storage is unavailable.
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
 * Gets this browser's push subscription, creating it only if it does not exist yet.
 *
 * Shared by service updates and reminders: a browser holds one endpoint, so both topics reuse the
 * same subscription rather than asking the browser to subscribe twice.
 */
async function obtainSubscription(client: PushSubscriptionClient): Promise<{
  endpoint: string
  keys: { p256dh: string; auth: string }
}> {
  const publicKey = await client.getPublicKey()
  if (!publicKey) throw new PushSubscriptionError('not-configured')

  const registration = await getRegistration()
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  })
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new PushSubscriptionError('invalid-subscription')
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

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

  const registrationBody = toPushSubscriptionRegistration(await obtainSubscription(client))
  if (!registrationBody) throw new PushSubscriptionError('invalid-subscription')

  await client.register(registrationBody)
  const preference: PushPreference = { topic: registrationBody.topic, endpoint: registrationBody.endpoint }
  savePushPreference(preference)
  return { preference, permission }
}

/**
 * Unsubscribes this browser and forgets it on the server.
 *
 * The server call is attempted first so a failure there leaves the local preference intact and
 * the toggle honest; the browser subscription is always cancelled, so no push is delivered after
 * the user turns this off.
 */
export async function disablePush(client: PushSubscriptionClient): Promise<PushPreference | null> {
  const preference = readPushPreference()
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  const endpoint = subscription?.endpoint ?? preference?.endpoint ?? null

  if (endpoint) await client.unregister(endpoint)
  await subscription?.unsubscribe()
  savePushPreference(null)
  return null
}

/**
 * Registers this browser to be reminded at one stop on one route.
 *
 * Same order as service updates: the UI has already said why, then this requests permission, then
 * reuses or creates the browser's single subscription, then replaces the server-side watch. It
 * replaces rather than adds because a browser holds one endpoint and the control asks for one stop
 * at a time, so a second tap reads as "remind me here instead".
 */
export async function enableReminder(
  client: PushSubscriptionClient,
  target: PushReminderTarget,
  previous: ReminderPreference | null = null,
): Promise<EnableReminderResult> {
  const permission = await requestPermission()
  if (permission !== 'granted') return { preference: previous, permission }

  const registrationBody = toPushReminderRegistration(await obtainSubscription(client), target)
  if (!registrationBody) throw new PushSubscriptionError('invalid-subscription')

  await client.registerReminder(registrationBody)
  const preference: ReminderPreference = {
    stopId: registrationBody.watch.stopId,
    routeId: registrationBody.watch.routeId,
    endpoint: registrationBody.endpoint,
  }
  saveReminderPreference(preference)
  return { preference, permission }
}

/**
 * Stops the reminder and forgets it on the server.
 *
 * Unlike disabling service updates this never calls `unsubscribe()`: the browser subscription is
 * shared by both topics, so cancelling it here would silently stop service-update pushes too.
 */
export async function disableReminder(client: PushSubscriptionClient): Promise<ReminderPreference | null> {
  const preference = readReminderPreference()
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  const endpoint = subscription?.endpoint ?? preference?.endpoint ?? null

  if (endpoint) await client.unregisterReminder(endpoint)
  saveReminderPreference(null)
  return null
}

/**
 * Wraps this runtime behind the domain port so app composition can hand it to Settings and stops.
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
    readReminder: readReminderPreference,
    enableReminder: (target) => enableReminder(client, target, readReminderPreference()),
    disableReminder: () => disableReminder(client),
  }
}

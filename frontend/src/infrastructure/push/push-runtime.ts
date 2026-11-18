import {
  PushSubscriptionError,
  PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY,
  PUSH_PREFERENCE_CHANGED_EVENT,
  ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY,
  type EnablePushResult,
  type EnableReminderResult,
  type PushEnvironment,
  type PushNotificationService,
  type PushPermission,
  type PushPreference,
  type ReminderPreference,
} from '../../domain/push/push-notifications'
import type {
  PushReminderLeadTimeSeconds,
  PushReminderTarget,
} from '@nusgo/shared/push/reminders'
import {
  DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS,
  isPushReminderLeadTimeSeconds,
} from '@nusgo/shared/push/reminders'
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
  window.dispatchEvent(new Event(PUSH_PREFERENCE_CHANGED_EVENT))
}

/**
 * Reads the saved reminder. A record that no longer has a stop, a route and an endpoint is
 * discarded rather than half-restored, so the control never claims a watch the server cannot hold.
 * A record from before lead times existed keeps the default lead time and an unknown expiry,
 * which is honest: the rider still sees the watch they asked for.
 */
export function readReminderPreference(): ReminderPreference | null {
  try {
    const stored = window.localStorage.getItem(ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { stopId, routeId, endpoint, leadTimeSeconds, expiresAt } = parsed as {
      stopId?: unknown
      routeId?: unknown
      endpoint?: unknown
      leadTimeSeconds?: unknown
      expiresAt?: unknown
    }
    if (
      typeof stopId !== 'string' || stopId.length === 0 ||
      typeof routeId !== 'string' || routeId.length === 0 ||
      typeof endpoint !== 'string' || endpoint.length === 0
    ) {
      return null
    }
    return {
      stopId,
      routeId,
      endpoint,
      leadTimeSeconds: isPushReminderLeadTimeSeconds(leadTimeSeconds)
        ? leadTimeSeconds
        : DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS,
      expiresAt: typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))
        ? expiresAt
        : null,
    }
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
  window.dispatchEvent(new Event(PUSH_PREFERENCE_CHANGED_EVENT))
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
 *
 * A subscription is bound to the VAPID key it was created with and cannot be rotated in place, so
 * one made for a previous key is removed from the server and cancelled before a replacement is
 * created. A failed server removal stops the replacement: the old endpoint must not be orphaned
 * on the server while the browser silently moves to a new one.
 */
async function obtainSubscription(client: PushSubscriptionClient, topic: 'service-updates' | 'alight-reminders'): Promise<{
  endpoint: string
  keys: { p256dh: string; auth: string }
}> {
  const publicKey = await client.getPublicKey()
  if (!publicKey) throw new PushSubscriptionError('not-configured')

  const registration = await getRegistration()
  const applicationServerKey = base64UrlToUint8Array(publicKey)
  let subscription = await registration.pushManager.getSubscription()
  let restoreUpdates = false
  let restoreReminder: ReminderPreference | null = null
  if (subscription) {
    const existingKey = subscription.options.applicationServerKey
    const existingBytes = existingKey ? new Uint8Array(existingKey) : null
    const matchesKey = existingBytes?.length === applicationServerKey.length &&
      existingBytes.every((byte, index) => byte === applicationServerKey[index])
    if (!matchesKey) {
      const savedUpdates = readPushPreference()
      const savedReminder = readReminderPreference()
      // Clean both topics before destroying the one browser endpoint they share.
      await client.unregisterReminder(subscription.endpoint)
      restoreReminder = savedReminder?.endpoint === subscription.endpoint ? savedReminder : null
      if (restoreReminder) saveReminderPreference(null)
      await client.unregister(subscription.endpoint)
      restoreUpdates = savedUpdates?.endpoint === subscription.endpoint
      if (restoreUpdates) savePushPreference(null)
      if (!await subscription.unsubscribe()) throw new PushSubscriptionError('invalid-subscription')
      subscription = null
    }
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new PushSubscriptionError('invalid-subscription')
  const replacement = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
  // The caller enrolls its requested topic; restore the other topic if rotation displaced it.
  if (topic !== 'service-updates' && restoreUpdates) {
    const body = toPushSubscriptionRegistration(replacement)
    if (!body) throw new PushSubscriptionError('invalid-subscription')
    await client.register(body)
    savePushPreference({ topic: body.topic, endpoint })
  }
  if (topic !== 'alight-reminders' && restoreReminder &&
    (restoreReminder.expiresAt === null || Date.parse(restoreReminder.expiresAt) > Date.now())) {
    const body = toPushReminderRegistration(replacement, restoreReminder)
    if (!body) throw new PushSubscriptionError('invalid-subscription')
    const acknowledgement = await client.registerReminder(body)
    saveReminderPreference({ ...restoreReminder, endpoint, expiresAt: acknowledgement?.expiresAt ?? null })
  }
  return replacement
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

  const registrationBody = toPushSubscriptionRegistration(await obtainSubscription(client, 'service-updates'))
  if (!registrationBody) throw new PushSubscriptionError('invalid-subscription')

  await client.register(registrationBody)
  const preference: PushPreference = { topic: registrationBody.topic, endpoint: registrationBody.endpoint }
  savePushPreference(preference)
  return { preference, permission }
}

/**
 * Forgets this browser's service-update subscription on the server.
 *
 * Both the saved endpoint and the browser's current endpoint are removed before the browser
 * subscription is cancelled, so an endpoint the browser refreshed since enrollment is not left
 * on the server. A failed server removal keeps the saved preference for a retry.
 *
 * The browser subscription is cancelled only when no alight reminder still depends on it: both
 * topics share one endpoint, so cancelling it here would silently stop reminders the rider never
 * asked to turn off.
 */
export async function disablePush(client: PushSubscriptionClient): Promise<PushPreference | null> {
  const preference = readPushPreference()
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  const endpoint = subscription?.endpoint ?? preference?.endpoint ?? null

  // The saved endpoint can differ from the current one after a browser refresh or key rotation.
  if (preference?.endpoint && preference.endpoint !== endpoint) {
    await client.unregister(preference.endpoint)
  }
  if (endpoint) await client.unregister(endpoint)
  const reminder = readReminderPreference()
  if (!reminder || reminder.endpoint !== endpoint) await subscription?.unsubscribe()
  savePushPreference(null)
  return null
}

/**
 * Registers this browser to be reminded before one stop on one route.
 *
 * Same order as service updates: the UI has already said why, then this requests permission, then
 * reuses or creates the browser's single subscription, then replaces the server-side watch. It
 * replaces rather than adds because a browser holds one endpoint and the control asks for one stop
 * at a time, so a second tap reads as "remind me here instead".
 *
 * The server owns the expiry, so this stores the expiry it echoes back. When the acknowledgement
 * is missing the lead time the rider chose is still recorded, so the control shows what was sent.
 */
export async function enableReminder(
  client: PushSubscriptionClient,
  target: PushReminderTarget & { readonly leadTimeSeconds: PushReminderLeadTimeSeconds },
  previous: ReminderPreference | null = null,
): Promise<EnableReminderResult> {
  const permission = await requestPermission()
  if (permission !== 'granted') return { preference: previous, permission }

  const registrationBody = toPushReminderRegistration(await obtainSubscription(client, 'alight-reminders'), target)
  if (!registrationBody) throw new PushSubscriptionError('invalid-subscription')

  const acknowledgement = await client.registerReminder(registrationBody)
  const preference: ReminderPreference = {
    stopId: registrationBody.watch.stopId,
    routeId: registrationBody.watch.routeId,
    endpoint: registrationBody.endpoint,
    // Prefer the server's echo: it is the value the evaluator will actually use.
    leadTimeSeconds: acknowledgement?.leadTimeSeconds ?? registrationBody.leadTimeSeconds,
    expiresAt: acknowledgement?.expiresAt ?? null,
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

  if (preference?.endpoint && preference.endpoint !== endpoint) {
    await client.unregisterReminder(preference.endpoint)
  }
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

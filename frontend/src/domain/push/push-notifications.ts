/**
 * The push-notification contract shared by Settings and the browser adapter.
 *
 * Features may depend on this module but not on `infrastructure`, so the port lives here and the
 * browser implementation is passed in from app composition. Nothing here touches a browser API.
 */
import type { PushNotificationTopic } from '@nusgo/shared/push/notifications'
import type { PushReminderTarget } from '@nusgo/shared/push/reminders'

export const PUSH_SUBSCRIPTION_PREFERENCE_STORAGE_KEY = 'navus:push-subscription:v1'

/**
 * The reminder preference lives apart from the subscription preference so turning reminders off
 * cannot silently turn service updates off, and the other way round.
 */
export const ALIGHT_REMINDER_PREFERENCE_STORAGE_KEY = 'navus:alight-reminder:v1'

export type PushAvailability =
  /** The browser can request permission and subscribe. */
  | 'available'
  /** Push exists, but on iOS it needs the app added to the Home Screen first. */
  | 'needs-home-screen'
  /** The browser has no Push API at all. */
  | 'unsupported'

export type PushPermission = 'default' | 'granted' | 'denied'

export interface PushEnvironment {
  readonly availability: PushAvailability
  readonly permission: PushPermission
}

export interface PushPreference {
  readonly topic: PushNotificationTopic
  readonly endpoint: string
}

export interface EnablePushResult {
  readonly preference: PushPreference | null
  readonly permission: PushPermission
}

/** The saved "remind me at this stop on this route" choice, which survives a reload. */
export interface ReminderPreference extends PushReminderTarget {
  readonly endpoint: string
}

export interface EnableReminderResult {
  readonly preference: ReminderPreference | null
  readonly permission: PushPermission
}

export class PushSubscriptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushSubscriptionError'
  }
}

/**
 * The browser capability Settings needs, implemented by the push runtime in infrastructure.
 *
 * `enable` and `enableReminder` are only ever called from a user action, so permission is never
 * requested on render.
 */
export interface PushNotificationService {
  /** Reports what this browser can do before anyone asks for permission. */
  getEnvironment(): PushEnvironment
  /** The stored preference, which is what makes the toggle survive a reload. */
  readPreference(): PushPreference | null
  enable(previous?: PushPreference | null): Promise<EnablePushResult>
  disable(): Promise<PushPreference | null>
  /** The saved alight reminder, if this browser has one. */
  readReminder(): ReminderPreference | null
  /** Asks to be reminded at one stop on one route; the caller must already have shown why. */
  enableReminder(target: PushReminderTarget): Promise<EnableReminderResult>
  disableReminder(): Promise<ReminderPreference | null>
}

export interface PushNotificationsState {
  readonly availability: PushAvailability
  readonly permission: PushPermission
  readonly enabled: boolean
  readonly busy: boolean
  readonly errorMessage: string
  readonly enable: () => void
  readonly disable: () => void
}

/**
 * State for one stop's reminder control.
 *
 * `watchedRouteId` is set only when the saved reminder names *this* stop, so opening another stop
 * never shows a departure as already watched.
 */
export interface ReminderState {
  readonly availability: PushAvailability
  readonly permission: PushPermission
  readonly watchedRouteId: string | null
  readonly busy: boolean
  readonly errorMessage: string
  readonly enable: (routeId: string) => void
  readonly disable: () => void
}

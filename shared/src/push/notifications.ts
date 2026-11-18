/**
 * Push notification wire contract shared by the backend sender and the service worker.
 * Keep this module free of Node and browser APIs so both runtimes can import it.
 */

export const PUSH_NOTIFICATION_TOPICS = ['service-updates', 'alight-reminders'] as const

export type PushNotificationTopic = (typeof PUSH_NOTIFICATION_TOPICS)[number]

export const PUSH_NOTIFICATION_TITLE_MAX_LENGTH = 80
export const PUSH_NOTIFICATION_BODY_MAX_LENGTH = 160

export interface PushNotificationPayload {
  readonly title: string
  readonly body: string
  /** App-relative deep link such as `?stop=COM3`; the service worker resolves it against its scope. */
  readonly url: string
  readonly topic: PushNotificationTopic
  /** Notifications with the same tag replace each other, so one stop shows one live update. */
  readonly tag: string
}

/** Deep link that opens a bus stop's Stops details. */
export function buildStopDeepLink(stopId: string): string {
  return '?stop=' + encodeURIComponent(stopId)
}

/**
 * Builds the approximate arrival reminder a rider asked for when they registered the watch.
 *
 * Title and body are kept inside the shared bounds so the same payload passes
 * `parsePushNotificationPayload` on the service worker side, and the tag is per stop and route so
 * a reminder replaces an earlier one for the same watch instead of stacking up.
 */
export function createAlightReminderPayload(
  stopName: string,
  stopId: string,
  routeId: string,
  minutesUntilArrival: number,
): PushNotificationPayload {
  const minutes = Math.max(1, Math.round(minutesUntilArrival))
  return {
    title: bound('Bus ' + routeId + ' is due soon', PUSH_NOTIFICATION_TITLE_MAX_LENGTH),
    // A long stop name must not push the body past the bound, or the service worker drops it.
    body: bound('About ' + minutes + ' min to ' + stopName, PUSH_NOTIFICATION_BODY_MAX_LENGTH),
    url: buildStopDeepLink(stopId),
    topic: 'alight-reminders',
    tag: 'reminder:' + encodeURIComponent(stopId) + ':' + encodeURIComponent(routeId),
  }
}

/** Trims to `maxLength`, ending with an ellipsis so the cut is visible rather than silent. */
function bound(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trimEnd() + '…'
}

/** Opens Stops for a service notice that does not name a particular stop. */
export function buildStopsViewDeepLink(): string {
  return '?view=stops'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) return null
  return text
}

function isTopic(value: unknown): value is PushNotificationTopic {
  return typeof value === 'string' && (PUSH_NOTIFICATION_TOPICS as readonly string[]).includes(value)
}

/**
 * Validates a received push payload. The service worker treats the payload as untrusted input,
 * so anything malformed is dropped rather than shown as a notification.
 */
export function parsePushNotificationPayload(input: unknown): PushNotificationPayload | null {
  if (!isRecord(input)) return null
  const title = boundedText(input.title, PUSH_NOTIFICATION_TITLE_MAX_LENGTH)
  const body = boundedText(input.body, PUSH_NOTIFICATION_BODY_MAX_LENGTH)
  const tag = boundedText(input.tag, 128)
  if (!title || !body || !tag || !isTopic(input.topic)) return null
  // Only same-origin app links are allowed; protocols and absolute URLs are rejected here.
  if (typeof input.url !== 'string' || !/^\?[A-Za-z0-9._%=&-]*$/.test(input.url)) return null
  return { title, body, url: input.url, topic: input.topic, tag }
}

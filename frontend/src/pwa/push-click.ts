/**
 * Turns a push deep link into an in-app destination.
 *
 * The service worker sends a `PUSH_NOTIFICATION_CLICK` message when it can focus an existing
 * window, and opens the app with the same link when it cannot. Both paths end up here, so the
 * parsing lives in one place and the link is treated as untrusted input either way.
 */

export const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK'

export interface PushClickTarget {
  readonly stopId: string
}

/** Reads `?stop=<id>` from a link the service worker produced; anything else is ignored. */
export function parsePushClickTarget(url: string): PushClickTarget | null {
  if (!url.startsWith('?')) return null
  try {
    const params = new URLSearchParams(url.slice(1))
    const stopId = params.get('stop')
    if (!stopId || stopId.length > 64) return null
    return { stopId }
  } catch {
    return null
  }
}

/**
 * Subscribes to notifications the service worker hands to an already-open window.
 * Returns an unsubscribe function so the caller can clean up on unmount.
 */
export function subscribeToPushClicks(onTarget: (target: PushClickTarget) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined

  const listener = (event: MessageEvent): void => {
    const data: unknown = event.data
    if (typeof data !== 'object' || data === null) return
    const message = data as { type?: unknown; url?: unknown }
    if (message.type !== PUSH_NOTIFICATION_CLICK_MESSAGE || typeof message.url !== 'string') return
    const target = parsePushClickTarget(message.url)
    if (target) onTarget(target)
  }

  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

export interface LaunchPushClickOptions {
  /** The current `window.location.search`, or the launch URL handed to the app. */
  readonly search: string
  /** Performs the in-app navigation for a launch link. */
  readonly open: (target: PushClickTarget) => void
  /** Drops the query string so a reload does not repeat the navigation. */
  readonly clearQuery: () => void
  /** Schedules the work and returns a cancel function. Defaults to a zero-delay timeout. */
  readonly schedule?: (run: () => void) => () => void
}

/**
 * Handles a push link on app launch, where no service-worker message exists.
 *
 * The navigation is scheduled, not immediate, because it depends on state that is not ready on
 * the first render. The query is cleared only inside that scheduled work: clearing it up front
 * loses the link if the effect is cleaned up before the timeout runs, which is exactly what
 * StrictMode does on every mount. Leaving it in place until the navigation actually happens
 * means the second mount still finds it.
 *
 * Returns a cancel function for the effect's cleanup.
 */
export function scheduleLaunchPushClick(options: LaunchPushClickOptions): () => void {
  const target = parsePushClickTarget(options.search)
  if (!target) return () => undefined

  const schedule = options.schedule ?? defaultSchedule
  return schedule(() => {
    options.open(target)
    options.clearQuery()
  })
}

function defaultSchedule(run: () => void): () => void {
  const timeout = window.setTimeout(run, 0)
  return () => window.clearTimeout(timeout)
}

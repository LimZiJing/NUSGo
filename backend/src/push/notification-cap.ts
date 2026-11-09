export interface NotificationCapOptions {
  readonly maxPerHour: number
  readonly now?: () => number
}

export interface NotificationReservation {
  /** Converts an in-flight allowance to a successfully delivered notification. */
  commit(): void
  /** Returns the allowance after a failed or cancelled attempt. Safe after commit. */
  release(): void
}

export interface NotificationCap {
  /** True while this endpoint may still receive a notification in its current hour. */
  hasCapacity(endpoint: string): boolean
  /** Reserves capacity synchronously so overlapping sends cannot exceed the cap. */
  reserve(endpoint: string): NotificationReservation | null
  reset(endpoint: string): void
  readonly trackedCount: number
}

const HOUR_MS = 60 * 60_000
const MAX_TRACKED_ENDPOINTS = 10_000

interface CapWindow {
  readonly startedAtMs: number
  count: number
  pending: number
}

/**
 * Caps how many notifications one subscription may receive per hour.
 *
 * The cap is per subscription rather than per subscriber, matching the store's identity model:
 * an endpoint is the only handle the server holds, and it holds nothing personal. History lives
 * here rather than in the subscription record, so it is forgotten when a subscription is removed.
 *
 * An in-flight reservation occupies capacity until delivery succeeds or fails. Failed sends
 * return the allowance without letting overlapping requests exceed the limit.
 */
export function createNotificationCap(options: NotificationCapOptions): NotificationCap {
  const maxPerHour = options.maxPerHour
  const now = options.now ?? Date.now
  const windows = new Map<string, CapWindow>()

  const windowFor = (endpoint: string): CapWindow => {
    const current = windows.get(endpoint)
    const nowMs = now()
    if (current && nowMs - current.startedAtMs < HOUR_MS) return current
    return { startedAtMs: nowMs, count: 0, pending: 0 }
  }

  const makeTrackingSpace = (endpoint: string): boolean => {
    if (windows.has(endpoint) || windows.size < MAX_TRACKED_ENDPOINTS) return true
    const nowMs = now()
    for (const [trackedEndpoint, window] of windows) {
      // Active or in-flight history must never be displaced to admit another endpoint.
      if (window.pending === 0 && nowMs - window.startedAtMs >= HOUR_MS) {
        windows.delete(trackedEndpoint)
        return true
      }
    }
    return false
  }

  return {
    hasCapacity(endpoint) {
      const activeWindow = windowFor(endpoint)
      return activeWindow.count + activeWindow.pending < maxPerHour && makeTrackingSpace(endpoint)
    },
    reserve(endpoint) {
      const activeWindow = windowFor(endpoint)
      if (activeWindow.count + activeWindow.pending >= maxPerHour || !makeTrackingSpace(endpoint)) return null
      activeWindow.pending += 1
      windows.set(endpoint, activeWindow)
      let settled = false
      const settle = (delivered: boolean): void => {
        if (settled) return
        settled = true
        activeWindow.pending -= 1
        // An unsubscribe or re-registration starts a new window. Old attempts must not spend it.
        if (delivered && windows.get(endpoint) === activeWindow) activeWindow.count += 1
      }
      return { commit: () => settle(true), release: () => settle(false) }
    },
    reset(endpoint) {
      windows.delete(endpoint)
    },
    get trackedCount() {
      return windows.size
    },
  }
}

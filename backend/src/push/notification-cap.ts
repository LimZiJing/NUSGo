export interface NotificationCapOptions {
  readonly maxPerHour: number
  readonly now?: () => number
}

export interface NotificationCap {
  /** True while this endpoint may still receive a notification in its current hour. */
  hasCapacity(endpoint: string): boolean
  /**
   * Records one accepted delivery. Called only after the push service accepted the payload, so a
   * transient failure does not silently use up someone's hourly allowance.
   */
  record(endpoint: string): void
  reset(endpoint: string): void
  readonly trackedCount: number
}

const HOUR_MS = 60 * 60_000
const MAX_TRACKED_ENDPOINTS = 10_000

interface CapWindow {
  readonly startedAtMs: number
  count: number
}

/**
 * Caps how many notifications one subscription may receive per hour.
 *
 * The cap is per subscription rather than per subscriber, matching the store's identity model:
 * an endpoint is the only handle the server holds, and it holds nothing personal. History lives
 * here rather than in the subscription record, so it is forgotten when a subscription is removed.
 *
 * Checking and recording are separate calls so a caller can attempt a delivery first and only
 * count it once the push service accepted it.
 */
export function createNotificationCap(options: NotificationCapOptions): NotificationCap {
  const maxPerHour = options.maxPerHour
  const now = options.now ?? Date.now
  const windows = new Map<string, CapWindow>()

  const windowFor = (endpoint: string): CapWindow => {
    const current = windows.get(endpoint)
    const nowMs = now()
    if (current && nowMs - current.startedAtMs < HOUR_MS) return current
    return { startedAtMs: nowMs, count: 0 }
  }

  return {
    hasCapacity(endpoint) {
      return windowFor(endpoint).count < maxPerHour
    },
    record(endpoint) {
      const activeWindow = windowFor(endpoint)
      if (activeWindow.count >= maxPerHour) return
      if (!windows.has(endpoint) && windows.size >= MAX_TRACKED_ENDPOINTS) {
        // Bound memory: drop the oldest window before tracking another endpoint.
        const oldestEndpoint = windows.keys().next().value
        if (oldestEndpoint !== undefined) windows.delete(oldestEndpoint)
      }
      activeWindow.count += 1
      windows.set(endpoint, activeWindow)
    },
    reset(endpoint) {
      windows.delete(endpoint)
    },
    get trackedCount() {
      return windows.size
    },
  }
}

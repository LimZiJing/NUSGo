/**
 * Backend-only normalized service announcement.
 *
 * The provider parses NUS ticker-tape records into `ServiceAnnouncementRecord`; this module then
 * decides which records are showing now and for whom. Nothing here is sent to the browser: an
 * announcement becomes a bounded push payload in `backend/src/push`, and the provider's raw
 * fields (author, created-by, incident coordinates) are never carried past the parser.
 */

export type ServiceAnnouncementPriority = 'high' | 'medium' | 'low'

/** One enabled ticker-tape record, with only the fields NUSGo uses. */
export interface ServiceAnnouncementRecord {
  readonly id: string
  readonly message: string
  readonly priority: ServiceAnnouncementPriority
  /** Epoch milliseconds at which the announcement starts showing. */
  readonly displayFromMs: number
  /** Epoch milliseconds at which it stops showing. */
  readonly displayToMs: number
  /** Raw `Affected_Service_Ids` tokens, split on commas; empty means every service. */
  readonly affectedServiceRouteIds: readonly string[]
}

/**
 * Who an announcement applies to.
 *
 * `global` is reserved for a record whose affected-service list is empty. A record that names
 * only retired or unknown services resolves to no audience at all, because treating it as
 * global would broadcast an obsolete route notice to everyone.
 */
export type ServiceAnnouncementAudience =
  | { readonly kind: 'global' }
  | { readonly kind: 'routes'; readonly routeIds: readonly string[] }

export interface ServiceAnnouncement {
  readonly id: string
  /** Dedupe key: a stable id plus the message, so an edited message is announced again. */
  readonly identity: string
  readonly message: string
  readonly priority: ServiceAnnouncementPriority
  readonly displayFromMs: number
  readonly displayToMs: number
  readonly audience: ServiceAnnouncementAudience
}

const PRIORITY_RANK: Readonly<Record<ServiceAnnouncementPriority, number>> = {
  high: 0,
  medium: 1,
  low: 2,
}

/** An active record is one announcement; a feed cannot grow this unboundedly per cycle. */
export const MAX_ACTIVE_SERVICE_ANNOUNCEMENTS = 50

/**
 * Announcements change slowly and the ticker tape is one upstream call, so the feed is asked at
 * most once a minute even though the arrival cycle runs every 30 seconds.
 */
export const SERVICE_ANNOUNCEMENT_REFRESH_INTERVAL_MS = 60_000

export interface SelectServiceAnnouncementsOptions {
  /** Epoch milliseconds used to test the display window. */
  readonly nowMs: number
  readonly canonicalRouteIds: ReadonlySet<string>
}

function canonicalRouteIdsFor(
  rawRouteIds: readonly string[],
  canonicalRouteIds: ReadonlySet<string>,
): readonly string[] {
  const matched: string[] = []
  for (const rawRouteId of rawRouteIds) {
    const match = canonicalRouteIds.has(rawRouteId)
      ? rawRouteId
      : [...canonicalRouteIds].find((routeId) => routeId.toLowerCase() === rawRouteId.toLowerCase())
    if (match && !matched.includes(match)) matched.push(match)
  }
  return matched
}

/**
 * Returns the announcements that are showing now, highest priority first.
 *
 * A record needs an explicit display interval that contains `nowMs`; a missing or malformed
 * interval fails closed instead of showing a historic notice. Records that are disabled were
 * already dropped by the parser.
 */
export function selectActiveServiceAnnouncements(
  records: readonly ServiceAnnouncementRecord[],
  options: SelectServiceAnnouncementsOptions,
): readonly ServiceAnnouncement[] {
  const active: ServiceAnnouncement[] = []

  for (const record of records) {
    if (record.displayFromMs > options.nowMs || record.displayToMs <= options.nowMs) continue

    const routeIds = canonicalRouteIdsFor(record.affectedServiceRouteIds, options.canonicalRouteIds)
    // An affected-service list that names no current service has no audience. Only an empty
    // list is a global announcement.
    if (routeIds.length === 0 && record.affectedServiceRouteIds.length > 0) continue

    active.push({
      id: record.id,
      identity: record.id + '|' + record.message,
      message: record.message,
      priority: record.priority,
      displayFromMs: record.displayFromMs,
      displayToMs: record.displayToMs,
      audience: routeIds.length === 0 ? { kind: 'global' } : { kind: 'routes', routeIds },
    })
  }

  return active.sort((first, second) =>
    PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority] ||
    second.displayFromMs - first.displayFromMs ||
    first.id.localeCompare(second.id)).slice(0, MAX_ACTIVE_SERVICE_ANNOUNCEMENTS)
}

export interface ServiceAnnouncementFeedOptions {
  /** Fetches the enabled ticker-tape records; rejects on a malformed or failed response. */
  readonly load: (signal: AbortSignal) => Promise<readonly ServiceAnnouncementRecord[]>
  readonly canonicalRouteIds: ReadonlySet<string>
  readonly now?: () => number
  /** Cached result lifetime. One upstream call per this interval, regardless of arrival cycles. */
  readonly refreshIntervalMs?: number
}

export interface ServiceAnnouncementFeed {
  /**
   * The announcements showing now, highest priority first. Reuses the cached feed inside its
   * refresh interval and shares one in-flight request, so callers may ask on every arrival cycle
   * without extra provider traffic.
   */
  refresh(signal?: AbortSignal): Promise<readonly ServiceAnnouncement[]>
  /** The last successfully loaded announcements; empty until the first load succeeds. */
  current(): readonly ServiceAnnouncement[]
}

/**
 * Owns announcement fetching cadence and caching.
 *
 * This is not a poller: it never holds a timer. The existing arrival refresh lifecycle calls
 * `refresh`, which returns the cached feed when it is still fresh.
 */
export function createServiceAnnouncementFeed(
  options: ServiceAnnouncementFeedOptions,
): ServiceAnnouncementFeed {
  const now = options.now ?? Date.now
  const refreshIntervalMs = options.refreshIntervalMs ?? SERVICE_ANNOUNCEMENT_REFRESH_INTERVAL_MS
  let cachedAtMs = Number.NEGATIVE_INFINITY
  let cachedRecords: readonly ServiceAnnouncementRecord[] = []
  let inFlight: Promise<readonly ServiceAnnouncement[]> | null = null

  const select = (records: readonly ServiceAnnouncementRecord[]): readonly ServiceAnnouncement[] =>
    selectActiveServiceAnnouncements(records, { nowMs: now(), canonicalRouteIds: options.canonicalRouteIds })

  return {
    refresh(signal) {
      if (inFlight) return inFlight
      if (now() - cachedAtMs < refreshIntervalMs) return Promise.resolve(select(cachedRecords))

      cachedAtMs = now()
      const request = (async (): Promise<readonly ServiceAnnouncement[]> => {
        try {
          cachedRecords = await options.load(signal ?? new AbortController().signal)
          return select(cachedRecords)
        } catch (error: unknown) {
          // A failed refresh keeps the last good feed; it does not blank a genuine live notice.
          // Shutdown cancels the request on purpose, so that case is not worth a warning.
          if (!signal?.aborted) {
            console.warn('NUS service-announcement refresh failed.', {
              errorType: error instanceof Error ? error.name : typeof error,
            })
          }
          return select(cachedRecords)
        }
      })()
      inFlight = request
      void request.finally(() => { inFlight = null })
      return request
    },
    current() {
      return select(cachedRecords)
    },
  }
}

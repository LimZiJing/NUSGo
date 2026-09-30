import type {
  ShuttleArrivalSnapshot,
  ShuttleRouteArrivalData,
} from '../../domain/transit/arrivals.js'

export interface ShuttleArrivalStop {
  readonly stopId: string
  readonly stopName: string
}

export interface ShuttleArrivalStopResult {
  readonly observedAt: string
  readonly expiresAt: string
  readonly routes: Readonly<Record<string, ShuttleRouteArrivalData>>
}

export type ShuttleArrivalStopLoader = (
  stop: ShuttleArrivalStop,
  signal: AbortSignal,
) => Promise<ShuttleArrivalStopResult>

export interface ShuttleArrivalStopFailure {
  readonly stopId: string
  readonly error: unknown
}

export interface ShuttleArrivalSnapshotRefreshResult {
  readonly snapshot: ShuttleArrivalSnapshot | null
  readonly published: boolean
  readonly successfulStopIds: readonly string[]
  readonly failures: readonly ShuttleArrivalStopFailure[]
}

export interface RefreshShuttleArrivalSnapshotOptions {
  readonly previousSnapshot?: ShuttleArrivalSnapshot | null
  readonly snapshotVersion: string
  readonly refreshIntervalMs: number
  readonly now?: () => number
  readonly signal?: AbortSignal
}

export interface ShuttleArrivalRefreshLog {
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly successfulStopCount: number
  readonly failedStopCount: number
  readonly snapshotVersion: string | null
  readonly published: boolean
}

export interface ShuttleArrivalSnapshotStoreOptions {
  readonly stops: readonly ShuttleArrivalStop[]
  readonly loadStop: ShuttleArrivalStopLoader
  readonly refreshIntervalMs: number
  readonly now?: () => number
  readonly onRefreshComplete?: (log: ShuttleArrivalRefreshLog, failures: readonly ShuttleArrivalStopFailure[]) => void
}

export interface ShuttleArrivalSnapshotStore {
  start(): void
  stop(): void
  refreshNow(): Promise<ShuttleArrivalSnapshotRefreshResult>
  getSnapshot(): ShuttleArrivalSnapshot | null
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

function earliestTimestamp(values: readonly string[], fallback: string): string {
  return values.length > 0 ? [...values].sort()[0] : fallback
}

export async function refreshShuttleArrivalSnapshot(
  stops: readonly ShuttleArrivalStop[],
  loadStop: ShuttleArrivalStopLoader,
  options: RefreshShuttleArrivalSnapshotOptions,
): Promise<ShuttleArrivalSnapshotRefreshResult> {
  const now = options.now ?? Date.now
  const signal = options.signal ?? new AbortController().signal
  const settled = await Promise.allSettled(
    stops.map((stop) => loadStop(stop, signal)),
  )
  const successfulStopIds: string[] = []
  const failures: ShuttleArrivalStopFailure[] = []
  const loaded = new Map<string, ShuttleArrivalStopResult>()

  settled.forEach((result, index) => {
    const stop = stops[index]
    if (!stop) return
    if (result.status === 'fulfilled') {
      successfulStopIds.push(stop.stopId)
      loaded.set(stop.stopId, result.value)
    } else {
      failures.push({ stopId: stop.stopId, error: result.reason })
    }
  })

  if (successfulStopIds.length === 0) {
    return {
      snapshot: options.previousSnapshot ?? null,
      published: false,
      successfulStopIds,
      failures,
    }
  }

  const previous = options.previousSnapshot
  const stopsSnapshot: Record<string, Readonly<Record<string, ShuttleRouteArrivalData>>> = {}
  const stopObservations: Record<string, { observedAt: string; expiresAt: string }> = {}

  for (const stop of stops) {
    const result = loaded.get(stop.stopId)
    if (result) {
      stopsSnapshot[stop.stopId] = result.routes
      stopObservations[stop.stopId] = {
        observedAt: result.observedAt,
        expiresAt: result.expiresAt,
      }
      continue
    }

    stopsSnapshot[stop.stopId] = previous?.stops[stop.stopId] ?? {}
    const previousObservation = previous?.stopObservations?.[stop.stopId]
    if (previousObservation) stopObservations[stop.stopId] = previousObservation
  }

  const refreshedAt = toIso(now())
  const nextRefreshAt = toIso(Date.parse(refreshedAt) + options.refreshIntervalMs)
  const observationTimes = Object.values(stopObservations).map(({ observedAt }) => observedAt)
  const snapshot: ShuttleArrivalSnapshot = {
    observedAt: earliestTimestamp(observationTimes, refreshedAt),
    expiresAt: nextRefreshAt,
    snapshotVersion: options.snapshotVersion,
    refreshedAt,
    nextRefreshAt,
    stops: stopsSnapshot,
    stopObservations,
  }

  return {
    snapshot,
    published: true,
    successfulStopIds,
    failures,
  }
}

export function createShuttleArrivalSnapshotStore(
  options: ShuttleArrivalSnapshotStoreOptions,
): ShuttleArrivalSnapshotStore {
  const now = options.now ?? Date.now
  let currentSnapshot: ShuttleArrivalSnapshot | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshInFlight: Promise<ShuttleArrivalSnapshotRefreshResult> | null = null
  let activeController: AbortController | null = null
  let started = false
  let generation = 0

  const scheduleNextRefresh = (): void => {
    if (!started) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => { void refreshNow() }, options.refreshIntervalMs)
  }

  const refreshNow = (): Promise<ShuttleArrivalSnapshotRefreshResult> => {
    if (refreshInFlight) return refreshInFlight

    const startedAtMs = now()
    const startedAt = toIso(startedAtMs)
    const snapshotVersion = `${startedAt}-${generation + 1}`
    generation += 1
    activeController = new AbortController()

    const refresh = (async (): Promise<ShuttleArrivalSnapshotRefreshResult> => {
      const result = await refreshShuttleArrivalSnapshot(options.stops, options.loadStop, {
        previousSnapshot: currentSnapshot,
        snapshotVersion,
        refreshIntervalMs: options.refreshIntervalMs,
        now,
        signal: activeController?.signal,
      })
      const completedAtMs = now()
      const nextRefreshAt = toIso(completedAtMs + options.refreshIntervalMs)
      if (result.published && result.snapshot) {
        currentSnapshot = { ...result.snapshot, nextRefreshAt, expiresAt: nextRefreshAt }
      } else if (currentSnapshot) {
        currentSnapshot = { ...currentSnapshot, nextRefreshAt, expiresAt: nextRefreshAt }
      }
      options.onRefreshComplete?.({
        startedAt,
        completedAt: toIso(completedAtMs),
        durationMs: Math.max(0, completedAtMs - startedAtMs),
        successfulStopCount: result.successfulStopIds.length,
        failedStopCount: result.failures.length,
        snapshotVersion: currentSnapshot?.snapshotVersion ?? null,
        published: result.published,
      }, result.failures)
      scheduleNextRefresh()
      return result
    })()

    refreshInFlight = refresh.finally(() => {
      refreshInFlight = null
      activeController = null
    })
    return refreshInFlight
  }

  return {
    start() {
      if (started) return
      started = true
      void refreshNow()
    },
    stop() {
      started = false
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = null
      activeController?.abort()
    },
    refreshNow,
    getSnapshot() {
      return currentSnapshot
    },
  }
}

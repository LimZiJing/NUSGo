import type { ApiShuttleVehiclesResponse, ShuttleVehiclePosition } from '@nusgo/shared'
import type { ParsedNusActiveBus } from '../providers/nus/active-buses.ts'
import { mapWithConcurrency } from '../upstream/concurrency.ts'

export interface BusVehicleRouteResult {
  readonly observedAt: string
  readonly expiresAt: string
  readonly vehicles: readonly ParsedNusActiveBus[]
}

export type BusVehicleRouteLoader = (
  routeId: string,
  signal: AbortSignal,
) => Promise<BusVehicleRouteResult>

export interface BusVehicleRouteFailure {
  readonly routeId: string
  readonly error: unknown
}

// snapshotVersion and generation are internal bookkeeping; the shared response type does not carry them.
export interface BusVehicleSnapshot extends ApiShuttleVehiclesResponse {
  readonly snapshotVersion: string
  readonly generation: number
}

export interface BusVehicleRefreshResult {
  readonly snapshot: BusVehicleSnapshot | null
  readonly published: boolean
  readonly successfulRouteIds: readonly string[]
  readonly failures: readonly BusVehicleRouteFailure[]
}

export interface BusVehicleRefreshLog {
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly successfulRouteCount: number
  readonly failedRouteCount: number
  readonly snapshotVersion: string | null
  readonly published: boolean
}

export interface BusVehicleSnapshotStoreOptions {
  readonly routeIds: readonly string[]
  readonly loadRoute: BusVehicleRouteLoader
  readonly refreshIntervalMs: number
  // Caps how long a route's vehicles can be served after its observation, even if the loader reports later.
  readonly vehicleExpiryMs: number
  // The timer cycle pauses once no request has arrived for this long. refreshNow() ignores it.
  readonly idleTimeoutMs: number
  readonly maxConcurrency: number
  readonly now?: () => number
  readonly onRefreshComplete?: (
    log: BusVehicleRefreshLog,
    failures: readonly BusVehicleRouteFailure[],
  ) => void
}

export interface BusVehicleSnapshotStore {
  start(): void
  stop(): Promise<void>
  refreshNow(): Promise<BusVehicleRefreshResult>
  getSnapshot(): BusVehicleSnapshot | null
  touch(): void
}

interface RouteState {
  readonly observedAtMs: number
  readonly expiresAtMs: number
  readonly vehicles: readonly ParsedNusActiveBus[]
}

type RouteOutcome =
  | { readonly routeId: string, readonly ok: true, readonly state: RouteState }
  | { readonly routeId: string, readonly ok: false, readonly error: unknown }

interface PublishedMeta {
  readonly generation: number
  readonly snapshotVersion: string
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

export function createBusVehicleSnapshotStore(
  options: BusVehicleSnapshotStoreOptions,
): BusVehicleSnapshotStore {
  if (!Number.isInteger(options.maxConcurrency) || options.maxConcurrency < 1) {
    throw new Error('Snapshot maxConcurrency must be a positive integer')
  }
  const now = options.now ?? Date.now
  const routeIds = [...new Set(options.routeIds)]
  // Last successful result per route. A failed route keeps its entry until it expires.
  const lastGood = new Map<string, RouteState>()
  let publishedMeta: PublishedMeta | null = null
  let generation = 0
  let lastTouchMs: number | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshInFlight: Promise<BusVehicleRefreshResult> | null = null
  let activeController: AbortController | null = null
  let started = false

  // Never throws, so one bad route cannot stop the rest of the cycle.
  const loadRouteOutcome = async (routeId: string, signal: AbortSignal): Promise<RouteOutcome> => {
    if (signal.aborted) return { routeId, ok: false, error: abortError(signal) }
    try {
      const result = await options.loadRoute(routeId, signal)
      const observedAtMs = Date.parse(result.observedAt)
      const expiresAtMs = Math.min(Date.parse(result.expiresAt), observedAtMs + options.vehicleExpiryMs)
      if (!Number.isFinite(observedAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new Error('Route result has invalid timestamps')
      }
      return { routeId, ok: true, state: { observedAtMs, expiresAtMs, vehicles: result.vehicles } }
    } catch (error: unknown) {
      return { routeId, ok: false, error }
    }
  }

  // Built on read, so carried-over routes stop being served as soon as they expire, not at the next cycle.
  const buildSnapshot = (nowMs: number): BusVehicleSnapshot | null => {
    const meta = publishedMeta
    if (!meta) return null

    const vehicles: ShuttleVehiclePosition[] = []
    const unavailableRouteIds: string[] = []
    let includedCount = 0
    let observedAtMs = Number.POSITIVE_INFINITY
    let expiresAtMs = Number.POSITIVE_INFINITY
    for (const routeId of routeIds) {
      const state = lastGood.get(routeId)
      if (!state || state.expiresAtMs <= nowMs) {
        unavailableRouteIds.push(routeId)
        continue
      }
      includedCount += 1
      observedAtMs = Math.min(observedAtMs, state.observedAtMs)
      expiresAtMs = Math.min(expiresAtMs, state.expiresAtMs)
      const observedAt = toIso(state.observedAtMs)
      const expiresAt = toIso(state.expiresAtMs)
      for (const vehicle of state.vehicles) {
        vehicles.push({
          routeId,
          plate: vehicle.plate,
          lat: vehicle.lat,
          lng: vehicle.lng,
          headingDegrees: vehicle.headingDegrees,
          speed: vehicle.speed,
          load: vehicle.load,
          observedAt,
          expiresAt,
        })
      }
    }

    return {
      observedAt: toIso(includedCount > 0 ? observedAtMs : nowMs),
      expiresAt: toIso(includedCount > 0 ? expiresAtMs : nowMs),
      vehicles,
      unavailableRouteIds,
      snapshotVersion: meta.snapshotVersion,
      generation: meta.generation,
    }
  }

  const isActive = (nowMs: number): boolean =>
    lastTouchMs !== null && nowMs - lastTouchMs <= options.idleTimeoutMs

  const scheduleNextRefresh = (delayMs: number): void => {
    if (!started) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(onTimer, delayMs)
    refreshTimer.unref?.()
  }

  const refreshNow = (): Promise<BusVehicleRefreshResult> => {
    if (refreshInFlight) return refreshInFlight

    const startedAtMs = now()
    const startedAt = toIso(startedAtMs)
    const controller = new AbortController()
    activeController = controller

    const cycle = (async (): Promise<BusVehicleRefreshResult> => {
      const outcomes = await mapWithConcurrency(
        routeIds,
        options.maxConcurrency,
        (routeId) => loadRouteOutcome(routeId, controller.signal),
      )
      // An aborted cycle's failures reflect shutdown, not NUS, so they are neither stored nor reported.
      const aborted = controller.signal.aborted
      const successfulRouteIds: string[] = []
      const failures: BusVehicleRouteFailure[] = []
      if (!aborted) {
        for (const outcome of outcomes) {
          if (outcome.ok) {
            lastGood.set(outcome.routeId, outcome.state)
            successfulRouteIds.push(outcome.routeId)
          } else {
            failures.push({ routeId: outcome.routeId, error: outcome.error })
          }
        }
      }

      const published = !aborted && successfulRouteIds.length > 0
      if (published) {
        generation += 1
        publishedMeta = { generation, snapshotVersion: startedAt + '-' + generation }
      }

      const completedAtMs = now()
      options.onRefreshComplete?.({
        startedAt,
        completedAt: toIso(completedAtMs),
        durationMs: Math.max(0, completedAtMs - startedAtMs),
        successfulRouteCount: successfulRouteIds.length,
        failedRouteCount: failures.length,
        snapshotVersion: publishedMeta?.snapshotVersion ?? null,
        published,
      }, failures)

      return {
        snapshot: buildSnapshot(completedAtMs),
        published,
        successfulRouteIds,
        failures,
      }
    })()

    refreshInFlight = cycle.finally(() => {
      refreshInFlight = null
      if (activeController === controller) activeController = null
      scheduleNextRefresh(Math.max(0, options.refreshIntervalMs - Math.max(0, now() - startedAtMs)))
    })
    return refreshInFlight
  }

  function onTimer(): void {
    refreshTimer = null
    if (!started) return
    if (!isActive(now())) {
      // Keep the timer chain alive so the next request resumes polling.
      scheduleNextRefresh(options.refreshIntervalMs)
      return
    }
    void refreshNow().catch(logRefreshError)
  }

  return {
    start() {
      if (started) return
      started = true
      scheduleNextRefresh(0)
    },
    async stop() {
      started = false
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = null
      activeController?.abort()
      await refreshInFlight?.catch(logRefreshError)
    },
    refreshNow,
    getSnapshot() {
      return buildSnapshot(now())
    },
    touch() {
      const nowMs = now()
      const wasActive = isActive(nowMs)
      lastTouchMs = nowMs
      // The first request after an idle spell starts a cycle at once instead of waiting for the timer.
      if (started && !wasActive && !refreshInFlight) void refreshNow().catch(logRefreshError)
    },
  }
}

function logRefreshError(error: unknown): void {
  console.error('Bus-vehicle snapshot refresh failed unexpectedly.', error instanceof Error ? error.name : typeof error)
}

import {
  INITIAL_LOCATION_TRACKING_STATE,
  type DeviceLocationFix,
  type LocationTrackingState,
} from '../../domain/location/types'
import { isValidLocationCoordinates } from '../../domain/location/coordinates'
import type { LocationTracker } from '../../app/contracts/location'

const DEFAULT_STALE_AFTER_MS = 2 * 60 * 1_000
const MAXIMUM_FUTURE_TIMESTAMP_MS = 5_000

export interface BrowserGeolocation {
  watchPosition(
    success: (position: unknown) => void,
    error: (error: unknown) => void,
    options?: PositionOptions,
  ): number
  clearWatch(watchId: number): void
}

export interface BrowserLocationTrackerOptions {
  readonly now?: () => number
  readonly staleAfterMs?: number
  readonly watchOptions?: PositionOptions
  readonly visibility?: BrowserVisibility
}

export interface BrowserVisibility {
  isVisible(): boolean
  subscribe(listener: () => void): () => void
}

function freezeState(state: LocationTrackingState): LocationTrackingState {
  return Object.freeze(state)
}

function getBrowserGeolocation(): BrowserGeolocation | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.geolocation
}

function getBrowserVisibility(): BrowserVisibility {
  if (typeof document === 'undefined') {
    return { isVisible: () => true, subscribe: () => () => undefined }
  }

  return {
    isVisible: () => document.visibilityState === 'visible',
    subscribe(listener) {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createLocationFix(
  position: unknown,
  now: number,
): { readonly kind: 'valid'; readonly fix: DeviceLocationFix } | { readonly kind: 'invalid' } {
  if (!isRecord(position) || !isRecord(position.coords)) return { kind: 'invalid' }
  const longitude = position.coords.longitude
  const latitude = position.coords.latitude
  const accuracy = position.coords.accuracy
  const timestamp = position.timestamp
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    typeof accuracy !== 'number' ||
    typeof timestamp !== 'number' ||
    !isValidLocationCoordinates(longitude, latitude) ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > now + MAXIMUM_FUTURE_TIMESTAMP_MS
  ) {
    return { kind: 'invalid' }
  }

  return {
    kind: 'valid',
    fix: Object.freeze({ longitude, latitude, accuracy, timestamp }),
  }
}

export function createBrowserLocationTracker(
  provider: BrowserGeolocation | undefined = getBrowserGeolocation(),
  options: BrowserLocationTrackerOptions = {},
): LocationTracker {
  const now = options.now ?? (() => Date.now())
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
  const visibility = options.visibility ?? getBrowserVisibility()
  const watchOptions: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 30_000,
    timeout: 30_000,
    ...options.watchOptions,
  }
  let state = INITIAL_LOCATION_TRACKING_STATE
  let watchId: number | null = null
  let watchGeneration = 0
  let staleTimer: ReturnType<typeof setTimeout> | null = null
  let trackingRequested = false
  let disposed = false
  const listeners = new Set<() => void>()

  const clearStaleTimer = (): void => {
    if (staleTimer === null) return
    clearTimeout(staleTimer)
    staleTimer = null
  }

  const publish = (nextState: LocationTrackingState): void => {
    if (disposed) return
    state = freezeState(nextState)
    for (const listener of [...listeners]) listener()
  }

  const stopWatching = (): void => {
    watchGeneration += 1
    if (watchId === null) return
    provider?.clearWatch(watchId)
    watchId = null
  }

  const isCurrentGeneration = (generation: number): boolean => (
    !disposed && generation === watchGeneration
  )

  const scheduleStaleState = (timestamp: number): void => {
    clearStaleTimer()
    const age = Math.max(0, now() - timestamp)
    const remaining = staleAfterMs - age
    if (remaining <= 0) {
      publish({ ...state, status: 'stale' })
      return
    }

    staleTimer = setTimeout(() => {
      staleTimer = null
      if (state.latestFix?.timestamp !== timestamp || state.status === 'disabled') return
      publish({ ...state, status: 'stale' })
    }, remaining)
  }

  const handlePosition = (generation: number, position: unknown): void => {
    if (!isCurrentGeneration(generation)) return
    const result = createLocationFix(position, now())
    if (result.kind !== 'valid') {
      clearStaleTimer()
      publish({ ...state, status: result.kind })
      return
    }

    const isStale = now() - result.fix.timestamp >= staleAfterMs
    publish({
      status: isStale ? 'stale' : 'tracking',
      latestFix: result.fix,
    })
    if (!isCurrentGeneration(generation)) return
    if (!isStale) scheduleStaleState(result.fix.timestamp)
  }

  const handleError = (generation: number, error: unknown): void => {
    if (!isCurrentGeneration(generation)) return
    const code = isRecord(error) && typeof error.code === 'number' ? error.code : null
    const status = code === 1
      ? 'denied'
      : code === 3
        ? 'timeout'
        : 'unavailable'
    clearStaleTimer()
    if (status === 'denied') {
      trackingRequested = false
      stopWatching()
    }
    publish({ ...state, status })
  }

  const startWatching = (): void => {
    if (disposed || !trackingRequested || !visibility.isVisible() || watchId !== null) return
    clearStaleTimer()
    publish({ ...state, status: 'requesting' })
    if (!provider) {
      publish({ ...state, status: 'unavailable' })
      return
    }

    const generation = ++watchGeneration
    try {
      const nextWatchId = provider.watchPosition(
        (position) => handlePosition(generation, position),
        (error) => handleError(generation, error),
        watchOptions,
      )
      if (generation !== watchGeneration) {
        provider.clearWatch(nextWatchId)
        return
      }
      watchId = nextWatchId
    } catch (error) {
      console.error('Location tracking failed:', error)
      if (generation === watchGeneration) publish({ ...state, status: 'unavailable' })
    }
  }

  const handleVisibilityChange = (): void => {
    if (disposed || !trackingRequested) return
    if (visibility.isVisible()) {
      startWatching()
      return
    }
    if (watchId === null) return
    stopWatching()
    clearStaleTimer()
    publish({ ...state, status: 'stale' })
  }

  const unsubscribeVisibility = visibility.subscribe(handleVisibilityChange)

  return {
    getState() {
      return state
    },

    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    enable() {
      if (disposed) return
      trackingRequested = true
      startWatching()
    },

    disable() {
      if (disposed) return
      trackingRequested = false
      stopWatching()
      clearStaleTimer()
      publish(INITIAL_LOCATION_TRACKING_STATE)
    },

    dispose() {
      if (disposed) return
      trackingRequested = false
      stopWatching()
      clearStaleTimer()
      state = INITIAL_LOCATION_TRACKING_STATE
      disposed = true
      unsubscribeVisibility()
      listeners.clear()
    },
  }
}

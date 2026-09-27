import {
  INITIAL_LOCATION_TRACKING_STATE,
  type DeviceLocationFix,
  type LocationTrackingState,
} from '../../domain/location/types'
import type { LocationTracker } from '../../app/contracts/location'

const DEFAULT_STALE_AFTER_MS = 2 * 60 * 1_000
const DEFAULT_MAXIMUM_ACCURACY_METRES = 100
const MAXIMUM_FUTURE_TIMESTAMP_MS = 5_000

export interface BrowserGeolocation {
  watchPosition(
    success: (position: GeolocationPosition) => void,
    error: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ): number
  clearWatch(watchId: number): void
}

export interface BrowserLocationTrackerOptions {
  readonly now?: () => number
  readonly staleAfterMs?: number
  readonly maximumAccuracyMetres?: number
  readonly watchOptions?: PositionOptions
}

function freezeState(state: LocationTrackingState): LocationTrackingState {
  return Object.freeze(state)
}

function getBrowserGeolocation(): BrowserGeolocation | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.geolocation
}

function isValidCoordinate(longitude: number, latitude: number): boolean {
  return Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
}

function createLocationFix(
  position: GeolocationPosition,
  now: number,
  maximumAccuracyMetres: number,
): { readonly kind: 'valid'; readonly fix: DeviceLocationFix } | {
  readonly kind: 'invalid' | 'low-accuracy'
} {
  const { longitude, latitude, accuracy } = position.coords
  const timestamp = position.timestamp
  if (
    !isValidCoordinate(longitude, latitude) ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > now + MAXIMUM_FUTURE_TIMESTAMP_MS
  ) {
    return { kind: 'invalid' }
  }

  if (accuracy > maximumAccuracyMetres) return { kind: 'low-accuracy' }

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
  const maximumAccuracyMetres = options.maximumAccuracyMetres ?? DEFAULT_MAXIMUM_ACCURACY_METRES
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

  const handlePosition = (position: GeolocationPosition): void => {
    const result = createLocationFix(position, now(), maximumAccuracyMetres)
    if (result.kind !== 'valid') {
      publish({ ...state, status: result.kind })
      return
    }

    const isStale = now() - result.fix.timestamp >= staleAfterMs
    publish({
      status: isStale ? 'stale' : 'tracking',
      latestFix: result.fix,
    })
    if (!isStale) scheduleStaleState(result.fix.timestamp)
  }

  const handleError = (error: GeolocationPositionError): void => {
    const status = error.code === 1
      ? 'denied'
      : error.code === 2
        ? 'unavailable'
        : 'timeout'
    if (status === 'denied') {
      stopWatching()
      clearStaleTimer()
    }
    publish({ ...state, status })
  }

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
      if (disposed || watchId !== null) return
      clearStaleTimer()
      publish({ ...state, status: 'requesting' })
      if (!provider) {
        publish({ ...state, status: 'unavailable' })
        return
      }

      const generation = ++watchGeneration
      try {
        const nextWatchId = provider.watchPosition(handlePosition, handleError, watchOptions)
        if (generation !== watchGeneration) {
          provider.clearWatch(nextWatchId)
          return
        }
        watchId = nextWatchId
      } catch {
        publish({ ...state, status: 'unavailable' })
      }
    },

    disable() {
      if (disposed) return
      stopWatching()
      clearStaleTimer()
      publish(INITIAL_LOCATION_TRACKING_STATE)
    },

    dispose() {
      if (disposed) return
      stopWatching()
      clearStaleTimer()
      state = INITIAL_LOCATION_TRACKING_STATE
      disposed = true
      listeners.clear()
    },
  }
}

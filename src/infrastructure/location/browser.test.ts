import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserLocationTracker, type BrowserGeolocation } from './browser'

interface GeolocationCallbacks {
  readonly success: (position: GeolocationPosition) => void
  readonly error: (error: GeolocationPositionError) => void
}

function createProvider(): {
  readonly provider: BrowserGeolocation
  readonly callbacks: GeolocationCallbacks[]
  readonly clearWatch: ReturnType<typeof vi.fn>
} {
  const callbacks: GeolocationCallbacks[] = []
  const clearWatch = vi.fn()
  const provider: BrowserGeolocation = {
    watchPosition: vi.fn((success, error) => {
      callbacks.push({ success, error })
      return callbacks.length
    }),
    clearWatch,
  }
  return { provider, callbacks, clearWatch }
}

function createPosition(overrides: Partial<GeolocationCoordinates & { timestamp: number }> = {}): GeolocationPosition {
  return {
    coords: {
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 1.2933,
      longitude: 103.7844,
      speed: null,
      ...overrides,
    },
    timestamp: overrides.timestamp ?? Date.now(),
  } as GeolocationPosition
}

function createError(code: 1 | 2 | 3): GeolocationPositionError {
  return { code, message: 'test error' } as GeolocationPositionError
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Browser location tracker', () => {
  it('starts in the disabled state and publishes a valid fix', () => {
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider, { now: () => 1_000 })
    const states = [tracker.getState()]
    tracker.subscribe(() => states.push(tracker.getState()))

    tracker.enable()
    callbacks[0].success(createPosition({ timestamp: 1_000 }))

    expect(states.map((state) => state.status)).toEqual(['disabled', 'requesting', 'tracking'])
    expect(tracker.getState().latestFix).toEqual({
      longitude: 103.7844,
      latitude: 1.2933,
      accuracy: 12,
      timestamp: 1_000,
    })
  })

  it('keeps the latest valid fix and accepts low-accuracy readings', () => {
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider, {
      now: () => 2_000,
    })
    tracker.enable()
    callbacks[0].success(createPosition({ timestamp: 2_000 }))

    callbacks[0].success(createPosition({ longitude: Number.NaN, timestamp: 2_001 }))
    expect(tracker.getState().status).toBe('invalid')
    expect(tracker.getState().latestFix?.timestamp).toBe(2_000)

    callbacks[0].success(createPosition({ accuracy: 500, timestamp: 2_002 }))
    expect(tracker.getState().status).toBe('tracking')
    expect(tracker.getState().latestFix?.accuracy).toBe(500)
  })

  it('ignores malformed browser payloads without throwing', () => {
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider)
    tracker.enable()

    callbacks[0].success({ coords: null } as unknown as GeolocationPosition)

    expect(tracker.getState()).toEqual({ status: 'invalid', latestFix: null })
  })

  it('marks a fix stale after the freshness window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(3_000)
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider, {
      staleAfterMs: 1_000,
      now: () => Date.now(),
    })
    tracker.enable()
    callbacks[0].success(createPosition({ timestamp: 3_000 }))

    vi.advanceTimersByTime(999)
    expect(tracker.getState().status).toBe('tracking')
    vi.advanceTimersByTime(1)
    expect(tracker.getState().status).toBe('stale')
  })

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('handles browser error code %s as %s', (code, status) => {
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider)
    tracker.enable()
    callbacks[0].error(createError(code))

    expect(tracker.getState().status).toBe(status)
  })

  it('does not let a stale timer hide a provider error', () => {
    vi.useFakeTimers()
    vi.setSystemTime(4_000)
    const { provider, callbacks } = createProvider()
    const tracker = createBrowserLocationTracker(provider, {
      staleAfterMs: 1_000,
      now: () => Date.now(),
    })
    tracker.enable()
    callbacks[0].success(createPosition({ timestamp: 4_000 }))
    callbacks[0].error(createError(2))

    vi.advanceTimersByTime(1_000)

    expect(tracker.getState().status).toBe('unavailable')
  })

  it('clears the watch and latest fix when disabled or disposed', () => {
    const { provider, callbacks, clearWatch } = createProvider()
    const tracker = createBrowserLocationTracker(provider)
    tracker.enable()
    callbacks[0].success(createPosition())

    tracker.disable()
    expect(clearWatch).toHaveBeenCalledWith(1)
    expect(tracker.getState()).toEqual({ status: 'disabled', latestFix: null })

    tracker.enable()
    tracker.dispose()
    expect(clearWatch).toHaveBeenCalledWith(2)
    expect(tracker.getState()).toEqual({ status: 'disabled', latestFix: null })
  })

  it('ignores callbacks that arrive after tracking is disabled', () => {
    const { provider, callbacks, clearWatch } = createProvider()
    const tracker = createBrowserLocationTracker(provider)
    tracker.enable()
    tracker.disable()

    callbacks[0].success(createPosition())
    callbacks[0].error(createError(2))

    expect(clearWatch).toHaveBeenCalledWith(1)
    expect(tracker.getState()).toEqual({ status: 'disabled', latestFix: null })
  })

  it('reports an unavailable state and logs when watchPosition throws', () => {
    const error = new Error('watch failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const provider: BrowserGeolocation = {
      watchPosition: vi.fn(() => { throw error }),
      clearWatch: vi.fn(),
    }
    const tracker = createBrowserLocationTracker(provider)

    try {
      tracker.enable()

      expect(tracker.getState()).toEqual({ status: 'unavailable', latestFix: null })
      expect(consoleError).toHaveBeenCalledWith('Location tracking failed:', error)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('reports unavailable when browser geolocation is missing', () => {
    const tracker = createBrowserLocationTracker(undefined)

    tracker.enable()

    expect(tracker.getState()).toEqual({ status: 'unavailable', latestFix: null })
  })
})

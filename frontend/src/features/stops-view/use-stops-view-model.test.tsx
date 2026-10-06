// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { LocationTrackingState } from '../../domain/location/types'
import type { PublicBusArrivalSnapshot } from '../../domain/transit/public-bus-arrivals'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import type { StopsServiceWindowsLoader } from './use-stops-service-windows'
import type { StopsArrivalLoader } from './use-stops-arrivals'
import { useStopsViewModel, type StopsViewModelOptions } from './use-stops-view-model'

const transitIndex = createTransitIndex(createValidTransitNetwork())
const arrivalSnapshot: ShuttleArrivalSnapshot = {
  observedAt: '2026-09-30T00:00:00.000Z',
  expiresAt: '2026-09-30T00:01:00.000Z',
  stops: {},
}
const publicArrivalSnapshot: PublicBusArrivalSnapshot = {
  source: 'lta-datamall',
  observedAt: '2026-09-30T00:00:00.000Z',
  expiresAt: '2026-09-30T00:01:00.000Z',
  refreshedAt: '2026-09-30T00:00:00.000Z',
  stops: {},
}

const loadArrivals: StopsArrivalLoader<ShuttleArrivalSnapshot> = async () => arrivalSnapshot
const loadPublicArrivals: StopsArrivalLoader<PublicBusArrivalSnapshot> = async () => publicArrivalSnapshot
const loadServiceWindows: StopsServiceWindowsLoader = async () => ({})

function createOptions(overrides: Partial<StopsViewModelOptions> = {}): StopsViewModelOptions {
  return {
    transitIndex,
    mapCenter: { longitude: 103, latitude: 1 },
    location: { status: 'disabled', latestFix: null },
    active: true,
    loadArrivals,
    loadPublicArrivals,
    loadServiceWindows,
    requestLocation: vi.fn(),
    locateFromControl: vi.fn(),
    enableLocationTracking: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useStopsViewModel', () => {
  it('requests Nearby location when Stops becomes active and location is disabled', async () => {
    const requestLocation = vi.fn()
    const enableLocationTracking = vi.fn()

    renderHook(() => useStopsViewModel(createOptions({
      requestLocation,
      enableLocationTracking,
    })))

    await waitFor(() => expect(requestLocation).toHaveBeenCalledOnce())
    expect(enableLocationTracking).not.toHaveBeenCalled()
  })

  it('keeps the manual Locate action separate from automatic tracking activation', () => {
    const requestLocation = vi.fn()
    const locateFromControl = vi.fn()
    const enableLocationTracking = vi.fn()
    const { result } = renderHook(() => useStopsViewModel(createOptions({
      active: false,
      requestLocation,
      locateFromControl,
      enableLocationTracking,
    })))

    expect(requestLocation).not.toHaveBeenCalled()
    act(() => result.current.locateFromControl())

    expect(locateFromControl).toHaveBeenCalledOnce()
    expect(requestLocation).not.toHaveBeenCalled()
    expect(enableLocationTracking).not.toHaveBeenCalled()
  })

  it('expands only Nearby stops within range after the requested location succeeds', async () => {
    const requestLocation = vi.fn()
    const initialLocation: LocationTrackingState = { status: 'disabled', latestFix: null }
    const options = createOptions({ requestLocation, location: initialLocation })
    const { result, rerender } = renderHook(
      (currentOptions: StopsViewModelOptions) => useStopsViewModel(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(requestLocation).toHaveBeenCalledOnce())
    rerender({
      ...options,
      location: {
        status: 'tracking',
        latestFix: {
          longitude: 103,
          latitude: 1,
          accuracy: 10,
          timestamp: Date.now(),
        },
      },
    })

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    expect(result.current.state.expandedStopIds.favourites).toEqual([])
  })
})

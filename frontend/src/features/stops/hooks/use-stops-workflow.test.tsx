// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import type { PublicBusArrivalSnapshot } from '../../../domain/transit/public-bus-arrivals'
import type { ShuttleArrivalSnapshot } from '../../../domain/transit/arrivals'
import type { StopsServiceWindowsLoader } from './use-stops-service-windows'
import type { StopsArrivalLoader } from './use-stops-arrivals'
import { useStopsWorkflow, type StopsWorkflowOptions } from './use-stops-workflow'

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

function createOptions(overrides: Partial<StopsWorkflowOptions> = {}): StopsWorkflowOptions {
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

describe('useStopsWorkflow', () => {
  it('reports one no-live-data state when both arrival sources fail', async () => {
    const options = createOptions({
      loadArrivals: async () => { throw new Error('internal arrivals unavailable') },
      loadPublicArrivals: async () => { throw new Error('public arrivals unavailable') },
    })
    const { result } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.noLiveData).toBe(true))
    expect(result.current.liveArrivalMessage).toBe('No live data')
  })

  it('requests Nearby location when Stops becomes active and location is disabled', async () => {
    const requestLocation = vi.fn()
    const enableLocationTracking = vi.fn()

    renderHook(() => useStopsWorkflow(createOptions({
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
    const { result } = renderHook(() => useStopsWorkflow(createOptions({
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

  it('uses the settled map centre after the location button moves the camera', async () => {
    const locateFromControl = vi.fn()
    const options = createOptions({
      location: {
        status: 'tracking',
        latestFix: { longitude: 103.1, latitude: 1.1, accuracy: 10, timestamp: Date.now() },
      },
      locateFromControl,
    })
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    act(() => result.current.locateFromControl())
    expect(locateFromControl).toHaveBeenCalledOnce()

    rerender({ ...options, mapCenter: { longitude: 103.1, latitude: 1.1 } })
    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-B']))
    expect(result.current.stopListEntries.find(({ stop }) => stop.id === 'STOP-B')?.distanceMeters).toBe(0)
  })

  it('expands Nearby stops around the map centre without waiting for a device fix', async () => {
    const options = createOptions({
      location: { status: 'disabled', latestFix: null },
    })
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    expect(result.current.state.expandedStopIds.favourites).toEqual([])
    expect(result.current.stopListEntries.find(({ stop }) => stop.id === 'STOP-A')?.distanceMeters).toBeNull()
    rerender({ ...options, mapCenter: { longitude: 103.1, latitude: 1.1 } })
    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-B']))
  })

  it('keeps manual Nearby expansion changes until the map centre changes', async () => {
    const options = createOptions()
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    act(() => result.current.toggleExpanded('STOP-A'))
    rerender({ ...options, mapCenter: { longitude: 103, latitude: 1 } })
    expect(result.current.state.expandedStopIds.nearby).toEqual([])

    rerender({ ...options, mapCenter: { longitude: 103.1, latitude: 1.1 } })
    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-B']))
  })

  it('shows the Nearby crosshair only while Stops is active and Nearby is the selected list', () => {
    const options = createOptions()
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    expect(result.current.showNearbyCrosshair).toBe(true)

    act(() => result.current.selectStopList('favourites'))
    expect(result.current.showNearbyCrosshair).toBe(false)

    act(() => result.current.selectStopList('nearby'))
    expect(result.current.showNearbyCrosshair).toBe(true)

    rerender({ ...options, active: false })
    expect(result.current.showNearbyCrosshair).toBe(false)
  })

  it('highlights Nearby stops within the radius only while Nearby is active, regardless of card toggles', async () => {
    const options = createOptions()
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    expect(result.current.nearbyHighlightStopIds).toEqual(['STOP-A'])

    act(() => result.current.toggleExpanded('STOP-A'))
    expect(result.current.state.expandedStopIds.nearby).toEqual([])
    expect(result.current.nearbyHighlightStopIds).toEqual(['STOP-A'])

    act(() => result.current.selectStopList('favourites'))
    expect(result.current.nearbyHighlightStopIds).toEqual([])

    act(() => result.current.selectStopList('nearby'))
    expect(result.current.nearbyHighlightStopIds).toEqual(['STOP-A'])

    rerender({ ...options, active: false })
    expect(result.current.nearbyHighlightStopIds).toEqual([])

    rerender({ ...options, active: true, mapCenter: { longitude: 103.1, latitude: 1.1 } })
    await waitFor(() => expect(result.current.nearbyHighlightStopIds).toEqual(['STOP-B']))
  })

  it('keeps Favourites expansion unchanged and applies a pending map move on return to Nearby', async () => {
    localStorage.setItem('navus:favorite-stops:v1', '["STOP-B"]')
    const options = createOptions()
    const { result, rerender } = renderHook(
      (currentOptions: StopsWorkflowOptions) => useStopsWorkflow(currentOptions),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-A']))
    act(() => result.current.selectStopList('favourites'))
    act(() => result.current.toggleExpanded('STOP-B'))
    rerender({ ...options, mapCenter: { longitude: 103.1, latitude: 1.1 } })
    expect(result.current.state.expandedStopIds.favourites).toEqual(['STOP-B'])

    act(() => result.current.selectStopList('nearby'))
    await waitFor(() => expect(result.current.state.expandedStopIds.nearby).toEqual(['STOP-B']))
    expect(result.current.state.expandedStopIds.favourites).toEqual(['STOP-B'])
  })
})

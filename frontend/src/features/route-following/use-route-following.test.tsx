// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TransitNetwork } from '@nusgo/shared/transit/types'
import type { LocationTrackingState } from '../../domain/location/types'
import { createTransitIndex } from '../../domain/transit'
import { useRouteFollowing } from './use-route-following'

afterEach(cleanup)

const now = 1_000_000
const metadata = {
  source: 'test',
  routeStopOrder: 'test order',
  routeGeometry: 'not included',
  verifiedAt: '2026-01-01',
  routeOrderSource: 'test route source',
  coordinateSource: 'test coordinate source',
}
const longitudeForMeters = (meters: number): number => (
  103.78 + meters / (111_320 * Math.cos(1.29 * Math.PI / 180))
)

const index = createTransitIndex({
  version: 1,
  metadata,
  routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-1', 'STOP-2', 'STOP-3'] }],
  stops: [
    { id: 'STOP-1', longName: 'First Stop', shortName: 'First', latitude: 1.29, longitude: 103.78, services: ['A1'] },
    { id: 'STOP-2', longName: 'Second Stop', shortName: 'Second', latitude: 1.29, longitude: longitudeForMeters(300), services: ['A1'] },
    { id: 'STOP-3', longName: 'Third Stop', shortName: 'Third', latitude: 1.29, longitude: longitudeForMeters(600), services: ['A1'] },
  ],
} satisfies TransitNetwork)

function locationAt(longitude: number, timestamp: number, accuracy = 10): LocationTrackingState {
  return {
    status: 'tracking',
    latestFix: { longitude, latitude: 1.29, timestamp, accuracy },
  }
}

describe('useRouteFollowing', () => {
  it('confirms or rejects nearby stop prompts and waits for a new visit before asking again', async () => {
    const { result, rerender } = renderHook(
      ({ location, clock }) => useRouteFollowing(location, index, clock),
      { initialProps: { location: locationAt(103.78, now), clock: now } },
    )

    await waitFor(() => expect(result.current.suggestion?.id).toBe('STOP-1'))
    act(() => result.current.confirmSuggestion())
    expect(result.current.currentStop?.id).toBe('STOP-1')
    expect(result.current.hereStopId).toBe('STOP-1')
    expect(result.current.suggestion).toBeNull()

    rerender({ location: locationAt(longitudeForMeters(-100), now + 1_000), clock: now + 1_000 })
    await waitFor(() => expect(result.current.suggestion).toBeNull())
    rerender({ location: locationAt(103.78, now + 2_000), clock: now + 2_000 })
    await waitFor(() => expect(result.current.suggestion?.id).toBe('STOP-1'))

    act(() => result.current.dismissSuggestion())
    expect(result.current.suggestion).toBeNull()
    rerender({ location: locationAt(103.78, now + 3_000), clock: now + 3_000 })
    await waitFor(() => expect(result.current.suggestion).toBeNull())
  })

  it('advances on two fresh fixes and leaves the last Here stop when following ends', () => {
    let clock = now
    const { result, rerender } = renderHook(
      ({ location }) => useRouteFollowing(location, index, clock),
      { initialProps: { location: locationAt(103.78, now) } },
    )

    act(() => result.current.demoFollowRoute('A1'))
    expect(result.current.activeRoute?.id).toBe('A1')
    expect(result.current.activeStartIndex).toBe(0)
    expect(result.current.activeStopIndex).toBe(0)

    clock = now + 1_000
    rerender({ location: locationAt(longitudeForMeters(300), clock) })
    expect(result.current.activeStopIndex).toBe(0)

    clock = now + 2_000
    rerender({ location: locationAt(longitudeForMeters(300), clock) })
    expect(result.current.activeStopIndex).toBe(1)
    expect(result.current.currentStop?.id).toBe('STOP-2')
    expect(result.current.hereStopId).toBe('STOP-2')

    act(() => result.current.stopFollowing())
    expect(result.current.activeRoute).toBeNull()
    expect(result.current.activeStartIndex).toBeNull()
    expect(result.current.currentStop?.id).toBe('STOP-2')
    expect(result.current.hereStopId).toBe('STOP-2')

    clock = now + 3_000
    rerender({ location: locationAt(longitudeForMeters(600), clock) })
    expect(result.current.activeStopIndex).toBeNull()
  })

  it('simulates a route from its first stop and advances one stop per demo click', () => {
    const { result } = renderHook(() => useRouteFollowing(locationAt(103.78, now), index, now))

    act(() => result.current.demoFollowRoute('A1'))
    expect(result.current.currentStop?.id).toBe('STOP-1')
    expect(result.current.activeStartIndex).toBe(0)
    expect(result.current.activeStopIndex).toBe(0)
    expect(result.current.announcement).toBe('Demo · A1 · First')

    act(() => result.current.demoFollowRoute('A1'))
    expect(result.current.currentStop?.id).toBe('STOP-2')
    expect(result.current.activeStopIndex).toBe(1)

    act(() => result.current.demoFollowRoute('A1'))
    expect(result.current.currentStop?.id).toBe('STOP-3')
    expect(result.current.activeStopIndex).toBe(2)

    act(() => result.current.demoFollowRoute('A1'))
    expect(result.current.currentStop?.id).toBe('STOP-1')
    expect(result.current.activeStopIndex).toBe(0)
  })

  it('does not advance with a location fix outside the 25 metre accuracy limit', () => {
    let clock = now
    const { result, rerender } = renderHook(
      ({ location }) => useRouteFollowing(location, index, clock),
      { initialProps: { location: locationAt(103.78, now) } },
    )

    act(() => result.current.demoFollowRoute('A1'))
    clock = now + 1_000
    rerender({ location: locationAt(longitudeForMeters(300), clock, 25.1) })
    clock = now + 2_000
    rerender({ location: locationAt(longitudeForMeters(300), clock, 25.1) })

    expect(result.current.activeStopIndex).toBe(0)
  })

  it('pauses route progress while location tracking is unavailable', () => {
    const { result, rerender } = renderHook(
      ({ location }) => useRouteFollowing(location, index, now),
      { initialProps: { location: { ...locationAt(103.78, now), status: 'stale' as const } } },
    )

    act(() => result.current.demoFollowRoute('A1'))
    rerender({ location: { ...locationAt(longitudeForMeters(300), now + 1_000), status: 'stale' } })

    expect(result.current.activeStopIndex).toBe(0)
  })
})
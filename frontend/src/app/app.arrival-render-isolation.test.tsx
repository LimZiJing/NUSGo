// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const commandStubs = {
    locateUser: vi.fn(),
    enableLocationTracking: vi.fn(),
    setLiveVehicles: vi.fn(),
  }
  return {
    state: null as unknown,
    renderCounts: { explore: 0, plan: 0 },
    onMapCenterChange: null as ((coordinate: readonly [number, number]) => void) | null,
    commands: new Proxy(commandStubs, {
      get: (target, property, receiver) => Reflect.get(target, property, receiver) ?? noop,
    }),
    arrivalsClient: { getArrivals: vi.fn() },
    serviceHoursClient: { getServiceWindows: vi.fn() },
    vehiclesClient: { getVehicles: vi.fn() },
  }
})

vi.mock('../features/explore/explore-content.tsx', async () => {
  const { createElement } = await import('react')
  return {
    ExploreContent: () => {
      appHarness.renderCounts.explore += 1
      return createElement('div', { 'data-testid': 'explore-render-probe' })
    },
  }
})

vi.mock('../features/plan/plan-content.tsx', async () => {
  const { createElement } = await import('react')
  return {
    PlanContent: () => {
      appHarness.renderCounts.plan += 1
      return createElement('div', { 'data-testid': 'plan-render-probe' })
    },
  }
})

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: (
    _container: HTMLElement,
    dependencies: { onMapCenterChange?: (coordinate: readonly [number, number]) => void },
  ) => {
    appHarness.onMapCenterChange = dependencies.onMapCenterChange ?? null
    dependencies.onMapCenterChange?.([103.77, 1.29])
    return { session: null, dispose: () => undefined }
  },
  createNavigationSessionCommandAdapter: () => () => appHarness.commands,
}))

vi.mock('./use-navigation-session', () => ({
  useNavigationSession: () => appHarness.state,
}))

vi.mock('../infrastructure/map/session', () => ({ createMapSession: vi.fn() }))
vi.mock('../infrastructure/shuttle-arrivals/client', () => ({
  createShuttleArrivalClient: () => appHarness.arrivalsClient,
}))
vi.mock('../infrastructure/shuttle-service-hours/client', () => ({
  createShuttleServiceHoursClient: () => appHarness.serviceHoursClient,
}))
vi.mock('../infrastructure/shuttle-vehicles/client', () => ({
  createShuttleVehicleClient: () => appHarness.vehiclesClient,
}))

const FAVORITE_STOPS_KEY = 'navus:favorite-stops:v1'
let visibilityStateDescriptor: PropertyDescriptor | undefined

function mockMobileViewport(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
}

function arrivalSnapshot(observedAtMs: number, seconds: number, generation: number): ShuttleArrivalSnapshot {
  const observedAt = new Date(observedAtMs).toISOString()
  return {
    observedAt,
    expiresAt: new Date(observedAtMs + 10 * 60_000).toISOString(),
    snapshotVersion: `${observedAt}-${generation}`,
    stops: {
      'STOP-A': {
        A1: {
          nextArrivalSeconds: seconds,
          upcomingArrivalSeconds: [seconds, seconds + 300],
          headwaySeconds: { min: 300, median: 300, max: 300 },
        },
      },
    },
  }
}

beforeEach(() => {
  mockMobileViewport()
  visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  const nowMs = Date.now()
  appHarness.state = {
    ...createInitialNavigationSessionState(),
    transitIndex: createTransitIndex(createValidTransitNetwork()),
  }
  appHarness.renderCounts.explore = 0
  appHarness.renderCounts.plan = 0
  appHarness.arrivalsClient.getArrivals
    .mockReset()
    .mockResolvedValueOnce(arrivalSnapshot(nowMs, 300, 1))
    .mockResolvedValueOnce(arrivalSnapshot(nowMs + 1_000, 300, 2))
    .mockResolvedValueOnce(arrivalSnapshot(nowMs + 30_000, 420, 3))
  appHarness.serviceHoursClient.getServiceWindows.mockReset().mockResolvedValue({})
  appHarness.vehiclesClient.getVehicles.mockReset().mockResolvedValue({
    observedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 90_000).toISOString(),
    vehicles: [],
  })
  localStorage.setItem(FAVORITE_STOPS_KEY, JSON.stringify(['STOP-A']))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  appHarness.onMapCenterChange = null
  if (visibilityStateDescriptor) {
    Object.defineProperty(document, 'visibilityState', visibilityStateDescriptor)
  } else {
    Reflect.deleteProperty(document, 'visibilityState')
  }
})

describe('arrival rendering isolation', () => {
  it('keeps Explore and Plan renders stable across map, location, and changed background arrivals', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<App />)
    await waitFor(() => expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    await waitFor(() => expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledTimes(2))

    const afterListLoad = { ...appHarness.renderCounts }
    act(() => appHarness.onMapCenterChange?.([103.78, 1.295]))
    const afterMapCentre = { ...appHarness.renderCounts }

    const currentState = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
    appHarness.state = {
      ...currentState,
      location: {
        status: 'tracking',
        latestFix: { longitude: 103.79, latitude: 1.296, accuracy: 10, timestamp: Date.now() },
      },
    }
    rerender(<App />)
    const afterLocation = { ...appHarness.renderCounts }

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const beforeOtherTabPan = { ...appHarness.renderCounts }
    act(() => appHarness.onMapCenterChange?.([103.82, 1.31]))
    const beforeBackgroundRefresh = { ...appHarness.renderCounts }
    const requestedStopsWhileStopsWasActive = appHarness.arrivalsClient.getArrivals.mock.calls[1]?.[0]
    expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledTimes(2)
    expect(beforeBackgroundRefresh).toEqual({
      explore: beforeOtherTabPan.explore + 1,
      plan: beforeOtherTabPan.plan + 1,
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledTimes(3))
    expect(appHarness.arrivalsClient.getArrivals.mock.calls[2]?.[0]).toEqual(requestedStopsWhileStopsWasActive)
    const afterChangedArrivalGeneration = { ...appHarness.renderCounts }
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    const measurements = {
      afterListLoad,
      afterMapCentre,
      afterLocation,
      beforeBackgroundRefresh,
      afterChangedArrivalGeneration,
    }
    expect(measurements.afterMapCentre).toEqual({
      explore: measurements.afterListLoad.explore + 1,
      plan: measurements.afterListLoad.plan + 1,
    })
    expect(measurements.afterLocation).toEqual({
      explore: measurements.afterMapCentre.explore + 1,
      plan: measurements.afterMapCentre.plan + 1,
    })
    expect(measurements.afterChangedArrivalGeneration).toEqual(measurements.beforeBackgroundRefresh)
    expect(document.querySelector('.stop-departure-list')?.textContent).toContain('7')
  })
})

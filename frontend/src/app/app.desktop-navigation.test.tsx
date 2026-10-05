// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const commandStubs = {
    navigateToEndpoint: vi.fn(),
    locateUser: vi.fn(),
  }
  return {
    state: null as unknown,
    onStopSelected: null as ((stopId: string) => boolean) | null,
    onMapStopInteraction: null as ((stopId: string) => void) | null,
    session: {
      locateUser: vi.fn(),
      enableLocationTracking: vi.fn(),
    },
    commands: new Proxy(commandStubs, {
      get: (target, property, receiver) => Reflect.get(target, property, receiver) ?? noop,
    }),
    arrivalsClient: {
      getArrivals: vi.fn(),
    },
    serviceHoursClient: {
      getServiceWindows: vi.fn(),
    },
  }
})

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: (
    _container: HTMLElement,
    dependencies: {
      onStopSelected?: (stopId: string) => boolean
      onMapStopInteraction?: (stopId: string) => void
      onMapCenterChange?: (center: readonly [number, number]) => void
    },
  ) => {
    appHarness.onStopSelected = dependencies.onStopSelected ?? null
    appHarness.onMapStopInteraction = dependencies.onMapStopInteraction ?? null
    dependencies.onMapCenterChange?.([103, 1])
    return {
      session: appHarness.session,
      dispose: () => undefined,
    }
  },
  createNavigationSessionCommandAdapter: () => () => appHarness.commands,
}))

vi.mock('./use-navigation-session', () => ({
  useNavigationSession: () => appHarness.state,
}))

vi.mock('../infrastructure/shuttle-arrivals/client', () => ({
  createShuttleArrivalClient: () => appHarness.arrivalsClient,
}))

vi.mock('../infrastructure/shuttle-service-hours/client', () => ({
  createShuttleServiceHoursClient: () => appHarness.serviceHoursClient,
}))

function mockDesktopViewport(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

beforeEach(() => {
  mockDesktopViewport()
  appHarness.arrivalsClient.getArrivals.mockResolvedValue({
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    stops: {},
  })
  appHarness.serviceHoursClient.getServiceWindows.mockResolvedValue({})
  appHarness.state = {
    ...createInitialNavigationSessionState(),
    transitIndex: createTransitIndex(createValidTransitNetwork()),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  appHarness.onStopSelected = null
  appHarness.onMapStopInteraction = null
  appHarness.session.locateUser.mockReset()
  appHarness.session.enableLocationTracking.mockReset()
  appHarness.arrivalsClient.getArrivals.mockReset()
  appHarness.serviceHoursClient.getServiceWindows.mockReset()
  appHarness.commands.navigateToEndpoint.mockReset()
  appHarness.commands.locateUser.mockReset()
})

describe('desktop shared navigation shell', () => {
  it('uses the shared Navigate command from venue details and opens Plan', async () => {
    const user = userEvent.setup()
    const venue = { roomName: 'Computing 1', location: { x: 103.7, y: 1.3 } }
    appHarness.state = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      venues: { COM1: venue },
      exploreView: {
        mode: 'venue-detail',
        query: '',
        selectedVenue: { code: 'COM1', venue },
        history: [],
      },
    }
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    appHarness.commands.navigateToEndpoint.mockClear()
    appHarness.commands.locateUser.mockClear()
    await user.click(screen.getByRole('button', { name: 'Navigate' }))

    expect(appHarness.commands.navigateToEndpoint).toHaveBeenCalledWith({ kind: 'venue', id: 'COM1' })
    expect(appHarness.commands.locateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
  })

  it('starts on Stops and renders one active view at a time', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Map views' })
    expect(within(navigation).getByRole('button', { name: 'Stops' }).getAttribute('aria-current'))
      .toBe('page')
    expect(screen.getByRole('region', { name: 'Stops' })).toBeTruthy()
    expect(document.getElementById('explore-panel')?.hasAttribute('hidden')).toBe(true)
    expect(document.getElementById('plan-panel')?.hasAttribute('hidden')).toBe(true)
    expect(document.getElementById('explore-panel')?.hasAttribute('inert')).toBe(true)
    expect(document.getElementById('plan-panel')?.hasAttribute('inert')).toBe(true)
  })

  it('switches to the unified Explore view from the shared navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(screen.getByRole('region', { name: 'Find a venue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shuttle routes' })).toBeTruthy()
    expect(document.getElementById('stops-panel')?.hasAttribute('hidden')).toBe(true)
  })

  it('requests location on initial desktop Stops activation', async () => {
    render(<App />)

    await waitFor(() => expect(appHarness.session.locateUser).toHaveBeenCalledOnce())
  })

  it('loads Stops timing data only while Stops is active', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledTimes(1)
  })

  it('switches to Stops and opens the selected stop from a map stop interaction', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => {
      appHarness.onStopSelected?.('STOP-A')
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stop A, shuttle stop' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
  })

  it('switches to Stops when a map popup endpoint action is used', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => {
      appHarness.onMapStopInteraction?.('STOP-A')
    })

    await waitFor(() => expect(screen.getByRole('region', { name: 'Stops' })).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Stop A, shuttle stop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
  })

  it('preserves Stops view state while switching views', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    expect(screen.getByRole('button', { name: 'Favourites' }).getAttribute('aria-pressed'))
      .toBe('true')
  })
})

// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
    enableLocationTracking: vi.fn(),
  }
  return {
    state: null as unknown,
    onStopSelected: null as ((stopId: string) => boolean) | null,
    onMapStopDestinationSet: null as ((stopId: string) => void) | null,
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
      onMapStopDestinationSet?: (stopId: string) => void
    },
  ) => {
    appHarness.onStopSelected = dependencies.onStopSelected ?? null
    appHarness.onMapStopDestinationSet = dependencies.onMapStopDestinationSet ?? null
    return { session: null, dispose: () => undefined }
  },
  createNavigationSessionCommandAdapter: () => () => appHarness.commands,
}))

vi.mock('./use-navigation-session', () => ({
  useNavigationSession: () => appHarness.state,
}))

vi.mock('../infrastructure/map/session', () => ({
  createMapSession: vi.fn(),
}))

vi.mock('../infrastructure/shuttle-arrivals/client', () => ({
  createShuttleArrivalClient: () => appHarness.arrivalsClient,
}))

vi.mock('../infrastructure/shuttle-service-hours/client', () => ({
  createShuttleServiceHoursClient: () => appHarness.serviceHoursClient,
}))

const FAVORITE_STOPS_KEY = 'navus:favorite-stops:v1'

function mockMobileViewport(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

beforeEach(() => {
  mockMobileViewport()
  appHarness.arrivalsClient.getArrivals.mockResolvedValue({
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    stops: {
      'STOP-A': {
        A1: {
          nextArrivalSeconds: 300,
          upcomingArrivalSeconds: [300, 600],
          headwaySeconds: { min: 300, median: 300, max: 300 },
        },
      },
    },
  })
  appHarness.serviceHoursClient.getServiceWindows.mockResolvedValue({})
  localStorage.setItem(FAVORITE_STOPS_KEY, JSON.stringify(['STOP-A']))
  appHarness.state = {
    ...createInitialNavigationSessionState(),
    transitIndex: createTransitIndex(createValidTransitNetwork()),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  appHarness.arrivalsClient.getArrivals.mockReset()
  appHarness.serviceHoursClient.getServiceWindows.mockReset()
  appHarness.commands.navigateToEndpoint.mockReset()
  appHarness.commands.locateUser.mockReset()
  appHarness.commands.enableLocationTracking.mockReset()
  appHarness.onStopSelected = null
  appHarness.onMapStopDestinationSet = null
})

describe('mobile Stops tab state', () => {
  it('uses the shared Navigate command from stop details and opens Plan', async () => {
    const user = userEvent.setup()
    render(<App />)

    act(() => {
      expect(appHarness.onStopSelected?.('STOP-A')).toBe(true)
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Navigate to this stop' })).toBeTruthy())
    appHarness.commands.navigateToEndpoint.mockClear()
    appHarness.commands.locateUser.mockClear()
    appHarness.commands.enableLocationTracking.mockClear()

    await user.click(screen.getByRole('button', { name: 'Navigate to this stop' }))

    expect(appHarness.commands.navigateToEndpoint).toHaveBeenCalledWith({ kind: 'stop', id: 'STOP-A' })
    expect(appHarness.commands.locateUser).not.toHaveBeenCalled()
    expect(appHarness.commands.enableLocationTracking).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
  })

  it('renders live internal-shuttle arrivals for visible Stops cards', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    await user.click(screen.getByRole('button', { name: 'Expand Stop A, shuttle stop bus timings' }))
    await waitFor(() => expect(screen.getByText('5m')).toBeTruthy())

    expect(screen.getByText('LIVE')).toBeTruthy()
    expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledWith(
      [
        { stopId: 'STOP-A', stopName: 'Stop A' },
        { stopId: 'STOP-B', stopName: 'Stop B' },
      ],
      expect.any(AbortSignal),
    )
  })

  it('returns from Plan to Favourites with the selected stop card still collapsed', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    const stopCard = screen.getByRole('button', { name: 'Expand Stop A, shuttle stop bus timings' })
    await user.click(stopCard)
    await user.click(screen.getByRole('button', { name: 'Collapse Stop A, shuttle stop bus timings' }))

    expect(screen.getByRole('button', { name: 'Expand Stop A, shuttle stop bus timings' }).getAttribute('aria-expanded'))
      .toBe('false')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    expect(screen.getByRole('button', { name: 'Favourites' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Expand Stop A, shuttle stop bus timings' }).getAttribute('aria-expanded'))
      .toBe('false')
  })

  it('keeps a fully expanded Explore sheet when switching from venue search to shuttle routes', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Expand Explore panel' }))

    expect(screen.getByRole('button', { name: 'Collapse Explore panel' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Shuttle routes' }))

    expect(screen.getByRole('button', { name: 'Collapse Explore panel' })).toBeTruthy()
  })

  it('opens Plan after a shuttle-stop popup sets the destination', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => {
      appHarness.onMapStopDestinationSet?.('STOP-A')
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current'))
      .toBe('page'))
    expect(appHarness.commands.locateUser).not.toHaveBeenCalled()
    expect(appHarness.commands.enableLocationTracking).not.toHaveBeenCalled()
  })

  it('opens a map-selected stop from Explore and expands a collapsed Stops sheet', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Escape}')
    expect(screen.getByRole('region', { name: 'Stops' }).getAttribute('data-detent')).toBe('collapsed')
    await user.click(screen.getByRole('button', { name: 'Explore' }))

    const mapMarker = document.createElement('button')
    document.body.append(mapMarker)
    mapMarker.focus()

    act(() => {
      expect(appHarness.onStopSelected?.('STOP-A')).toBe(true)
    })

    await screen.findByRole('heading', { name: 'Stop A, shuttle stop' })
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('region', { name: 'Stops' }).getAttribute('data-detent')).toBe('partial')

    await user.click(screen.getByRole('button', { name: 'Back to stops' }))
    await waitFor(() => expect(document.activeElement).toBe(mapMarker))
    mapMarker.remove()
  })

  it('opens a stop from the Explore route list and restores its route context and focus', async () => {
    const initialState = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
    appHarness.state = {
      ...initialState,
      selectedRouteId: 'A1',
      exploreView: {
        mode: 'shuttle',
        query: '',
        selectedVenue: null,
        history: [],
      },
    }
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const stopRow = await screen.findByRole('button', {
      name: 'Stop A, shuttle stop, code STOP-A. Focus on map',
    })
    const scrollArea = stopRow.closest('.explore-route-browser-scroll')
    if (!scrollArea) throw new Error('Route stop row has no scroll area')
    scrollArea.scrollTop = 38
    stopRow.focus()
    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { name: 'Stop A, shuttle stop' })
    await user.click(screen.getByRole('button', { name: 'Back to stops' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('button', { name: 'Shuttle routes' })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Stop A, shuttle stop, code STOP-A. Focus on map',
    })).toBe(stopRow)
    expect(document.activeElement).toBe(stopRow)
    expect(scrollArea.scrollTop).toBe(38)
  })

  it('opens a nearby stop from venue details and restores venue context and focus', async () => {
    const initialState = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
    const venue = {
      roomName: 'Seminar Room 3',
      floor: 2,
      location: { x: 103, y: 1 },
    }
    appHarness.state = {
      ...initialState,
      venues: { 'COM1-0212': venue },
      exploreView: {
        mode: 'venue-detail',
        query: '',
        selectedVenue: { code: 'COM1-0212', venue },
        history: [{ mode: 'venue-search', query: 'COM1', selectedVenue: null }],
      },
    }
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const nearbyStop = await screen.findByRole('button', {
      name: /Nearby shuttle stop Stop A, code STOP-A/,
    })
    nearbyStop.focus()
    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { name: 'Stop A, shuttle stop' })
    await user.click(screen.getByRole('button', { name: 'Back to stops' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('heading', { name: 'COM1-0212, venue' })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: /Nearby shuttle stop Stop A, code STOP-A/,
    })).toBe(nearbyStop)
    expect(document.activeElement).toBe(nearbyStop)
  })
})

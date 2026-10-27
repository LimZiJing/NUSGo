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

function mockMobileLayoutGeometry(): void {
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('map-shell')) {
      return { x: 0, y: 0, top: 0, right: 390, bottom: 768, left: 0, width: 390, height: 768, toJSON: () => ({}) } as DOMRect
    }
    if (this.classList.contains('main-navigation')) {
      return { x: 0, y: 696, top: 696, right: 390, bottom: 752, left: 0, width: 390, height: 56, toJSON: () => ({}) } as DOMRect
    }
    return getBoundingClientRect.call(this)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('mobile-sheet-popup') || this.classList.contains('mobile-sheet-viewport')
      ? 768
      : 0
  })
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

  it('renders live internal-bus arrivals for visible Stops cards', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    await user.click(screen.getByRole('button', { name: 'Expand Stop A, bus stop arrival times' }))
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
    const stopCard = screen.getByRole('button', { name: 'Expand Stop A, bus stop arrival times' })
    await user.click(stopCard)
    await user.click(screen.getByRole('button', { name: 'Collapse Stop A, bus stop arrival times' }))

    expect(screen.getByRole('button', { name: 'Expand Stop A, bus stop arrival times' }).getAttribute('aria-expanded'))
      .toBe('false')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    expect(screen.getByRole('button', { name: 'Favourites' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Expand Stop A, bus stop arrival times' }).getAttribute('aria-expanded'))
      .toBe('false')
  })

  it('keeps a fully expanded Explore sheet when switching from venue search to bus routes', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Expand Explore panel' }))

    expect(screen.getByRole('button', { name: 'Reduce Explore panel' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Bus routes' }))

    expect(screen.getByRole('button', { name: 'Reduce Explore panel' })).toBeTruthy()
  })

  it('opens Plan after a bus-stop popup sets the destination', async () => {
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

    await screen.findByRole('heading', { name: 'Stop A, bus stop' })
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('region', { name: 'Stops' }).getAttribute('data-detent')).toBe('partial')

    await user.click(screen.getByRole('button', { name: 'Back to Find venue' }))
    await waitFor(() => expect(document.activeElement).toBe(mapMarker))
    mapMarker.remove()
  })

  it('keeps the collapsed Stops sheet positioned after returning from waypoint placement', async () => {
    mockMobileLayoutGeometry()
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{Escape}')
    const stopsSheet = screen.getByRole('region', { name: 'Stops' })
    expect(stopsSheet.getAttribute('data-detent')).toBe('collapsed')
    const initialSnapOffset = stopsSheet.style.getPropertyValue('--drawer-snap-point-offset')

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    expect(screen.getByRole('region', { name: 'Place personal waypoint' })).toBeTruthy()

    window.dispatchEvent(new Event('resize'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    await user.click(screen.getByRole('button', { name: 'Close More' }))

    expect(stopsSheet.getAttribute('data-detent')).toBe('collapsed')
    expect(stopsSheet.style.getPropertyValue('--drawer-snap-point-offset')).toBe(initialSnapOffset)
  })

  it('keeps the mobile keyboard closed while placing and naming a waypoint', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))

    const placementHeading = screen.getByRole('heading', { name: 'Place waypoint' })
    expect(document.activeElement).toBe(placementHeading)
    expect(document.activeElement).not.toBe(screen.getByRole('spinbutton', { name: 'Latitude' }))

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Name' }))
  })

  it('opens a stop from the Explore route list and restores its route context and focus', async () => {
    const initialState = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
    appHarness.state = {
      ...initialState,
      selectedRouteId: 'A1',
      exploreState: {
        mode: 'bus-routes',
        query: '',
        selectedVenue: null,
        history: [],
      },
    }
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const stopRow = await screen.findByRole('button', {
      name: 'Stop A, bus stop, code STOP-A. Focus on map',
    })
    const scrollArea = stopRow.closest('.explore-bus-route-list-scroll')
    if (!scrollArea) throw new Error('Route stop row has no scroll area')
    scrollArea.scrollTop = 38
    stopRow.focus()
    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { name: 'Stop A, bus stop' })
    await user.click(screen.getByRole('button', { name: 'Back to bus routes' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('button', { name: 'Bus routes' })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Stop A, bus stop, code STOP-A. Focus on map',
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
      exploreState: {
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
      name: /Nearby bus stop Stop A, code STOP-A/,
    })
    nearbyStop.focus()
    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { name: 'Stop A, bus stop' })
    await user.click(screen.getByRole('button', { name: 'Back to Find venue' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('heading', { name: 'COM1-0212, venue' })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: /Nearby bus stop Stop A, code STOP-A/,
    })).toBe(nearbyStop)
    expect(document.activeElement).toBe(nearbyStop)
  })
})

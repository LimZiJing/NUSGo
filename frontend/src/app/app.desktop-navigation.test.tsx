// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { Path } from '@nusgo/shared/routing/path'
import type { ScoredPathCandidate } from '@nusgo/shared/routing/path'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const commandStubs = {
    navigateToEndpoint: vi.fn(),
    locateUser: vi.fn(),
    suspendMobileRoutes: vi.fn(),
  }
  return {
    state: null as unknown,
    onStopSelected: null as ((stopId: string) => boolean) | null,
    onMapStopInteraction: null as ((stopId: string) => void) | null,
    onMapStopDestinationSet: null as ((stopId: string) => void) | null,
    onMapJourneyOptionSelected: null as ((candidateKey: string) => void) | null,
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
      onMapStopDestinationSet?: (stopId: string) => void
      onMapJourneyOptionSelected?: (candidateKey: string) => void
      onMapCenterChange?: (center: readonly [number, number]) => void
    },
  ) => {
    appHarness.onStopSelected = dependencies.onStopSelected ?? null
    appHarness.onMapStopInteraction = dependencies.onMapStopInteraction ?? null
    appHarness.onMapStopDestinationSet = dependencies.onMapStopDestinationSet ?? null
    appHarness.onMapJourneyOptionSelected = dependencies.onMapJourneyOptionSelected ?? null
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

vi.mock('../infrastructure/map/session', () => ({
  createMapSession: vi.fn(),
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

function createJourneySelectionState() {
  const baseState = createInitialNavigationSessionState()
  const path: Path = {
    origin: { kind: 'venue', id: 'ORIGIN' },
    destination: { kind: 'venue', id: 'DESTINATION' },
    legs: [{
      mode: 'walking',
      from: { kind: 'venue', id: 'ORIGIN' },
      to: { kind: 'venue', id: 'DESTINATION' },
      durationSeconds: 60,
      distanceMeters: 100,
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
    }],
    totalDurationSeconds: 60,
    totalDistanceMeters: 100,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
  }
  const selectedCandidate: ScoredPathCandidate = {
    candidateKey: 'option-a', path, adjustedDurationSeconds: 60, score: 1 / 60,
  }
  const otherCandidate: ScoredPathCandidate = {
    candidateKey: 'option-b',
    path: { ...path, totalDurationSeconds: 120 },
    adjustedDurationSeconds: 120,
    score: 1 / 120,
  }
  return {
    state: {
      ...baseState,
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      path: {
        ...baseState.path,
        status: 'ready',
        path,
        candidates: [selectedCandidate, otherCandidate],
        displayedCandidates: [selectedCandidate, otherCandidate],
        selectedCandidateKey: selectedCandidate.candidateKey,
      },
    },
  }
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
  appHarness.onMapStopDestinationSet = null
  appHarness.onMapJourneyOptionSelected = null
  appHarness.session.locateUser.mockReset()
  appHarness.session.enableLocationTracking.mockReset()
  appHarness.arrivalsClient.getArrivals.mockReset()
  appHarness.serviceHoursClient.getServiceWindows.mockReset()
  appHarness.commands.navigateToEndpoint.mockReset()
  appHarness.commands.locateUser.mockReset()
  appHarness.commands.suspendMobileRoutes.mockReset()
})

describe('desktop shared navigation shell', () => {
  it('has no Fit routes button for a retained Journey in Plan', async () => {
    const user = userEvent.setup()
    const baseState = createInitialNavigationSessionState()
    const path: Path = {
      origin: { kind: 'venue', id: 'ORIGIN' },
      destination: { kind: 'venue', id: 'DESTINATION' },
      legs: [{
        mode: 'walking',
        from: { kind: 'venue', id: 'ORIGIN' },
        to: { kind: 'venue', id: 'DESTINATION' },
        durationSeconds: 60,
        distanceMeters: 100,
        geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
      }],
      totalDurationSeconds: 60,
      totalDistanceMeters: 100,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }
    const candidate: ScoredPathCandidate = {
      candidateKey: 'retained-journey',
      path,
      adjustedDurationSeconds: 60,
      score: 1 / 60,
    }
    appHarness.state = {
      ...baseState,
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      path: {
        ...baseState.path,
        status: 'ready',
        path,
        candidates: [candidate],
        displayedCandidates: [candidate],
        selectedCandidateKey: candidate.candidateKey,
      },
    }
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Fit routes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expect(screen.queryByRole('button', { name: 'Fit routes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    expect(screen.queryByRole('button', { name: 'Fit routes' })).toBeNull()
  })

  it('preserves the selected option when switching tabs with the same Journey results', async () => {
    const user = userEvent.setup()
    const baseState = createInitialNavigationSessionState()
    const path: Path = {
      origin: { kind: 'venue', id: 'ORIGIN' },
      destination: { kind: 'venue', id: 'DESTINATION' },
      legs: [{
        mode: 'walking',
        from: { kind: 'venue', id: 'ORIGIN' },
        to: { kind: 'venue', id: 'DESTINATION' },
        durationSeconds: 60,
        distanceMeters: 100,
        geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
      }],
      totalDurationSeconds: 60,
      totalDistanceMeters: 100,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }
    const first: ScoredPathCandidate = {
      candidateKey: 'option-a', path, adjustedDurationSeconds: 60, score: 1 / 60,
    }
    const second: ScoredPathCandidate = {
      candidateKey: 'option-b',
      path: { ...path, totalDurationSeconds: 120 },
      adjustedDurationSeconds: 120,
      score: 1 / 120,
    }
    appHarness.state = {
      ...baseState,
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      path: {
        ...baseState.path,
        status: 'ready',
        path: second.path,
        candidates: [first, second],
        displayedCandidates: [first, second],
        selectedCandidateKey: second.candidateKey,
      },
    }
    render(<App />)

    const expectSecondSelected = (): void => {
      const summaries = Array.from(document.querySelectorAll('.journey-option-summary'))
      expect(summaries).toHaveLength(2)
      expect(summaries[0]?.getAttribute('aria-current')).toBeNull()
      expect(summaries[1]?.getAttribute('aria-current')).toBe('true')
    }
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expectSecondSelected()
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expectSecondSelected()
  })

  it('uses the shared Navigate command from venue details and opens Plan', async () => {
    const user = userEvent.setup()
    const venue = { roomName: 'Computing 1', location: { x: 103.7, y: 1.3 } }
    appHarness.state = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      venues: { COM1: venue },
      exploreState: {
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

    const navigation = screen.getByRole('navigation', { name: 'Map navigation tabs' })
    expect(within(navigation).getByRole('button', { name: 'Stops' }).getAttribute('aria-current'))
      .toBe('page')
    expect(screen.getByRole('region', { name: 'Stops' })).toBeTruthy()
    expect(document.getElementById('explore-panel')?.hasAttribute('hidden')).toBe(true)
    expect(document.getElementById('plan-panel')?.hasAttribute('hidden')).toBe(true)
    expect(document.getElementById('explore-panel')?.hasAttribute('inert')).toBe(true)
    expect(document.getElementById('plan-panel')?.hasAttribute('inert')).toBe(true)
  })

  it('switches to the unified Explore tab from the shared navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(screen.getByRole('region', { name: 'Find a venue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bus routes' })).toBeTruthy()
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

  it('opens an Explore map stop in Stops and returns keyboard focus to its marker', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const mapMarker = document.createElement('button')
    document.body.append(mapMarker)
    mapMarker.focus()

    act(() => {
      expect(appHarness.onStopSelected?.('STOP-A')).toBe(true)
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stop A, bus stop' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')

    await user.click(screen.getByRole('button', { name: 'Back to Find venue' }))
    await waitFor(() => expect(document.activeElement).toBe(mapMarker))
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page')
    mapMarker.remove()
  })

  it('switches to Stops for a map popup origin action', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => {
      appHarness.onMapStopInteraction?.('STOP-A')
    })

    await waitFor(() => expect(screen.getByRole('region', { name: 'Stops' })).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Stop A, bus stop' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
  })

  it('opens Plan after a map popup sets the destination', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => {
      appHarness.onMapStopDestinationSet?.('STOP-A')
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current'))
      .toBe('page'))
    expect(screen.getByRole('region', { name: 'Trip endpoints' })).toBeTruthy()
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

describe.each(['Stops', 'Explore'] as const)('map Journey selection from %s', (priorTab) => {
  it('activates Plan and reveals the selected card on desktop without moving focus', async () => {
    mockDesktopViewport()
    const { state } = createJourneySelectionState()
    appHarness.state = priorTab === 'Explore'
      ? { ...state, exploreState: { ...state.exploreState, mode: 'bus-routes' } }
      : state
    render(<App />)
    if (priorTab === 'Explore') await userEvent.setup().click(screen.getByRole('button', { name: 'Explore' }))

    const focused = document.createElement('button')
    document.body.append(focused)
    focused.focus()
    act(() => {
      appHarness.state = {
        ...appHarness.state as object,
        path: {
          ...(appHarness.state as { path: object }).path,
          selectedCandidateKey: 'option-b',
        },
      }
      appHarness.onMapJourneyOptionSelected?.('option-b')
    })

    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('[data-candidate-key="option-b"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(document.activeElement).toBe(focused)
    if (priorTab === 'Explore') {
      expect(appHarness.commands.suspendMobileRoutes).toHaveBeenCalledOnce()
    } else {
      expect(appHarness.commands.suspendMobileRoutes).not.toHaveBeenCalled()
    }
    focused.remove()
  })

  it('scrolls the selected option header inside Plan without focusing or resizing its mobile sheet', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    const { state } = createJourneySelectionState()
    appHarness.state = priorTab === 'Explore'
      ? { ...state, exploreState: { ...state.exploreState, mode: 'bus-routes' } }
      : state
    const { rerender } = render(<App />)
    if (priorTab === 'Explore') await user.click(screen.getByRole('button', { name: 'Explore' }))
    const content = document.querySelector<HTMLElement>('.plan-content-panel')
    const target = document.querySelector<HTMLElement>('[data-candidate-key="option-b"]')
    expect(content).toBeTruthy()
    expect(target).toBeTruthy()
    if (!content || !target) throw new Error('Plan option header was not rendered')

    Object.defineProperty(content, 'scrollTop', { configurable: true, writable: true, value: 0 })
    content.getBoundingClientRect = () => ({
      top: 100, bottom: 300, left: 0, right: 300, width: 300, height: 200, x: 0, y: 100,
      toJSON: () => ({}),
    })
    target.getBoundingClientRect = () => ({
      top: 320, bottom: 350, left: 0, right: 300, width: 300, height: 30, x: 0, y: 320,
      toJSON: () => ({}),
    })
    const focused = document.createElement('button')
    document.body.append(focused)
    focused.focus()
    const sheet = content.closest<HTMLElement>('[data-mobile-sheet]')
    const initialDetent = sheet?.dataset.detent

    act(() => appHarness.onMapJourneyOptionSelected?.('option-b'))
    appHarness.state = {
      ...appHarness.state as object,
      path: {
        ...(appHarness.state as { path: object }).path,
        selectedCandidateKey: 'option-b',
      },
    }
    act(() => rerender(<App />))

    expect(content.scrollTop).toBe(50)
    expect(document.activeElement).toBe(focused)
    expect(sheet?.dataset.detent).toBe(initialDetent)
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    if (priorTab === 'Explore') {
      expect(appHarness.commands.suspendMobileRoutes).toHaveBeenCalledOnce()
    } else {
      expect(appHarness.commands.suspendMobileRoutes).not.toHaveBeenCalled()
    }
    focused.remove()
  })

  it('reopens a collapsed Plan sheet at its last detent for a map selection', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    const { state } = createJourneySelectionState()
    appHarness.state = state
    const { rerender } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Expand Plan trip panel' }))
    await user.click(screen.getByRole('button', { name: 'Reduce Plan trip panel' }))
    await user.keyboard('{ArrowDown}')
    const sheet = document.querySelector<HTMLElement>('.plan-sheet')
    expect(sheet?.dataset.detent).toBe('collapsed')
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    const focused = document.createElement('button')
    document.body.append(focused)
    focused.focus()
    act(() => {
      appHarness.state = {
        ...appHarness.state as object,
        path: {
          ...(appHarness.state as { path: object }).path,
          selectedCandidateKey: 'option-b',
        },
      }
      appHarness.onMapJourneyOptionSelected?.('option-b')
    })
    act(() => rerender(<App />))

    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(sheet?.dataset.detent).toBe('partial')
    expect(document.querySelector('[data-candidate-key="option-b"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(document.activeElement).toBe(focused)
    focused.remove()
  })
})

describe('mobile drawer tab switches', () => {
  it('keeps every drawer open at the destination tab detent and hides inactive panels', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Expand Stops panel' }))
    await user.click(screen.getByRole('button', { name: 'Reduce Stops panel' }))
    await user.keyboard('{ArrowDown}')
    expect(document.querySelector('.stops-sheet')?.getAttribute('data-detent')).toBe('collapsed')

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    const viewports = Array.from(document.querySelectorAll<HTMLElement>('.mobile-sheet-viewport'))
    expect(viewports).toHaveLength(4)
    expect(viewports.every((viewport) => viewport.hasAttribute('data-open'))).toBe(true)
    expect(document.querySelector('.stops-sheet')?.getAttribute('data-detent')).toBe('collapsed')
    expect(document.querySelector('.explore-sheet')?.getAttribute('data-detent')).toBe('partial')
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('partial')
    const exploreViewport = document.querySelector<HTMLElement>('.explore-sheet')
      ?.closest<HTMLElement>('.mobile-sheet-viewport')
    expect(exploreViewport?.dataset.active).toBe('true')
    expect(viewports.filter((viewport) => viewport !== exploreViewport).every(
      (viewport) => viewport.hasAttribute('inert') && viewport.getAttribute('aria-hidden') === 'true',
    )).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    expect(document.querySelector('.plan-sheet')?.closest('.mobile-sheet-viewport')?.getAttribute('data-active'))
      .toBe('true')
    await user.click(screen.getByRole('button', { name: 'Stops' }))
    expect(document.querySelector('.stops-sheet')?.getAttribute('data-detent')).toBe('collapsed')
    expect(document.querySelector('.explore-sheet')?.getAttribute('data-detent')).toBe('partial')
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('partial')
    expect(viewports.every((viewport) => viewport.hasAttribute('data-open'))).toBe(true)
  })
})

describe('More surface', () => {
  it('hides the desktop navigation column while placing a Personal Waypoint', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))

    expect(screen.getByRole('region', { name: 'Place personal waypoint' })).toBeTruthy()
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(false)
  })

  it('validates and applies typed coordinates before continuing', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))

    const latitude = screen.getByRole('spinbutton', { name: 'Latitude' })
    const longitude = screen.getByRole('spinbutton', { name: 'Longitude' })
    await user.clear(latitude)
    await user.type(latitude, '91')
    await user.clear(longitude)
    await user.type(longitude, '103.9')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('region', { name: 'Place personal waypoint' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('valid latitude and longitude')
    expect(screen.queryByLabelText('Name')).toBeNull()

    await user.clear(latitude)
    await user.type(latitude, '1.5')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Name')).toBe(document.activeElement)
    expect(screen.getByText('1.500000, 103.900000')).toBeTruthy()
  })

  it('creates a Personal Waypoint only after Save waypoint', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('crypto', { randomUUID: () => '4a85589b-4941-4a85-8d47-7c46f5d47400' })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    expect(screen.getByRole('heading', { name: 'Place waypoint' })).toBeTruthy()
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Name'), '  Quiet bench  ')
    await user.type(screen.getByLabelText('Category'), ' Study spot ')
    await user.type(screen.getByLabelText('Note (optional)'), ' Near the trees ')
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))

    const stored = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}')
    expect(stored.version).toBe(1)
    expect(stored.waypoints).toEqual([expect.objectContaining({
      name: 'Quiet bench', category: 'Study spot', note: 'Near the trees',
      coordinate: { longitude: 103, latitude: 1 },
    })])
    expect(screen.getByRole('status').textContent).toContain('Waypoint saved')
    vi.unstubAllGlobals()
  })

  it('keeps cancelled and invalid waypoint drafts out of storage', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))
    expect(screen.getAllByText('Must not be empty.')).toHaveLength(2)
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
  })

  it('preserves unreadable saved data and pauses creation', async () => {
    localStorage.setItem('navus:personal-waypoints:v1', '{broken')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    expect(screen.getByRole('button', { name: 'Add waypoint' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Back to previous view' })).toBe(document.activeElement)
    expect(screen.getByRole('alert').textContent).toContain('needs recovery')
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBe('{broken')
  })

  it('shows the nearby map crosshair on mobile and hides it while More is open', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(document.querySelector('.nearby-crosshair-area')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close More' }))

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
  })

  it('opens More at the partial mobile sheet detent and lets the user expand it', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)
    const moreButton = screen.getByRole('button', { name: 'More' })

    await user.click(moreButton)

    const sheet = document.querySelector('.more-panel-surface')
    expect(sheet?.getAttribute('data-detent')).toBe('partial')
    expect(screen.getByRole('button', { name: 'Expand More panel' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Map navigation tabs' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Expand More panel' }))

    expect(sheet?.getAttribute('data-detent')).toBe('full')
    expect(screen.getByRole('button', { name: 'Reduce More panel' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Close More' }))
    await user.click(moreButton)

    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-detent')).toBe('partial')
  })

  it('opens More destinations as full-height mobile screens', async () => {
    mockMobileViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1,
      waypoints: [{
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Quiet bench',
        category: 'Rest spot',
        coordinate: { longitude: 103.78, latitude: 1.29 },
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      }],
    }))
    const user = userEvent.setup()
    render(<App />)
    const moreButton = screen.getByRole('button', { name: 'More' })

    await user.click(moreButton)
    const sheet = document.querySelector<HTMLElement>('.more-panel-surface')
    expect(sheet?.getAttribute('data-page')).toBe('menu')

    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    expect(sheet?.getAttribute('data-page')).toBe('waypoints')
    expect(sheet?.getAttribute('data-detent')).toBe('full')
    expect(screen.queryByRole('button', { name: /More actions for Quiet bench/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit list' }))
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(true)
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(sheet?.getAttribute('data-page')).toBe('menu')
    expect(sheet?.getAttribute('data-detent')).toBe('partial')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(sheet?.getAttribute('data-page')).toBe('settings')
    expect(sheet?.getAttribute('data-detent')).toBe('full')
  })

  it('hides and restores the nearby crosshair around desktop More', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(document.querySelector('.nearby-crosshair-area')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close More' }))
    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
  })

  it('opens and closes on desktop without changing the active workflow', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    const moreButton = screen.getByRole('button', { name: 'More' })
    await user.click(moreButton)

    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My waypoints' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByRole('button', { name: /^(Explore|Stops|Plan)$/ })).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Close More' }))

    expect(screen.queryByRole('heading', { name: 'More' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
    expect(document.activeElement).toBe(moreButton)
  })

  it('manages favourite-stop order and membership in Settings', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    localStorage.setItem('navus:favorite-stops:v1', JSON.stringify(['STOP-A', 'STOP-B']))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settingsPanel = document.querySelector<HTMLElement>('.more-panel-content-scroll')
    if (!settingsPanel) throw new Error('Settings panel is missing')
    expect(within(settingsPanel).queryByRole('button', { name: /More actions for/ })).toBeNull()
    await user.click(within(settingsPanel).getByRole('button', { name: 'Edit list' }))
    await user.click(within(settingsPanel).getByRole('button', { name: 'Move Stop B up' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual(['STOP-B', 'STOP-A']))

    await user.click(within(settingsPanel).getByRole('button', { name: 'Remove Stop A from favourites' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual(['STOP-B']))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(within(settingsPanel).getByRole('button', { name: 'Clear all' }))
    expect(confirm).toHaveBeenCalledWith('Clear all favourite bus stops?')
    confirm.mockRestore()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual([]))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByText('Star a stop in Stops to add it to your favourites.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Manage in Stops' })).toBeNull()
  })

  it('leaves the mobile navigation pill usable and closes when a workflow is selected', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Expand Plan trip panel' }))
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('full')

    appHarness.session.locateUser.mockClear()
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('true')
    expect(appHarness.session.locateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('navigation', { name: 'Map navigation tabs' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('full')

    await user.click(screen.getByRole('button', { name: 'Close More' }))

    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('full')

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page')
  })

  it('applies and remembers a chosen theme after remount', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    const firstRender = render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('navus:theme-preference:v1')).toBe('dark')

    firstRender.unmount()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect((screen.getByRole('radio', { name: 'Dark' }) as HTMLInputElement).checked).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('closes with Escape and returns focus to the More button', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)
    const moreButton = screen.getByRole('button', { name: 'More' })

    await user.click(moreButton)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('heading', { name: 'More' })).toBeNull()
    expect(document.activeElement).toBe(moreButton)
  })
})

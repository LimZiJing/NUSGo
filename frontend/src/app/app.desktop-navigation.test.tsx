// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { Path } from '@nusgo/shared/routing/path'
import type { ScoredPathCandidate } from '@nusgo/shared/routing/path'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const COMMUNITY_VISIBILITY_KEY = 'navus:community-waypoint-visible-categories:v1'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const commandStubs = {
    navigateToEndpoint: vi.fn(),
    locateUser: vi.fn(),
    enableLocationTracking: vi.fn(),
    suspendMobileRoutes: vi.fn(),
    enterMobileRoutes: vi.fn(),
    selectMobileRoute: vi.fn(),
    setPersonalWaypoints: vi.fn(),
    setWaypointPlacement: vi.fn(),
    setCommunityWaypoints: vi.fn(),
    setVisibleCenterZoom: vi.fn(),
    focusPersonalWaypoint: vi.fn(),
    captureCamera: vi.fn(() => ({
      center: [103.7764, 1.2966] as const,
      zoom: 17.25,
      bearing: -32,
      pitch: 45,
    })),
    restoreCamera: vi.fn(),
    focusCommunityWaypoint: vi.fn(),
    panToCoordinate: vi.fn(),
  }
  return {
    state: null as unknown,
    mountCount: 0,
    communityWaypoints: [] as unknown[],
    onStopSelected: null as ((stopId: string) => boolean) | null,
    onMapStopInteraction: null as ((stopId: string) => void) | null,
    onMapStopDestinationSet: null as ((stopId: string) => void) | null,
    onMapJourneyOptionSelected: null as ((candidateKey: string) => void) | null,
    onMapMovingChange: null as ((moving: boolean) => void) | null,
    onMapCenterChange: null as ((center: readonly [number, number]) => void) | null,
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
      onMapMovingChange?: (moving: boolean) => void
    },
  ) => {
    appHarness.mountCount += 1
    appHarness.onStopSelected = dependencies.onStopSelected ?? null
    appHarness.onMapStopInteraction = dependencies.onMapStopInteraction ?? null
    appHarness.onMapStopDestinationSet = dependencies.onMapStopDestinationSet ?? null
    appHarness.onMapJourneyOptionSelected = dependencies.onMapJourneyOptionSelected ?? null
    dependencies.onMapCenterChange?.([103, 1])
    appHarness.onMapMovingChange = dependencies.onMapMovingChange ?? null
    appHarness.onMapCenterChange = dependencies.onMapCenterChange ?? null
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

vi.mock('../infrastructure/data/community-waypoints', () => ({
  loadCommunityWaypoints: vi.fn(async () => appHarness.communityWaypoints as readonly CommunityWaypoint[]),
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

function mockChangeableViewport(initialMatch = false): (matches: boolean) => void {
  const listeners = new Set<() => void>()
  const mediaQuery = {
    matches: initialMatch,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  })
  return (matches) => {
    mediaQuery.matches = matches
    listeners.forEach((listener) => listener())
  }
}

function setActiveLocationFix(): void {
  appHarness.state = {
    ...(appHarness.state as Record<string, unknown>),
    location: {
      status: 'tracking',
      latestFix: { longitude: 103.7844, latitude: 1.2933, accuracy: 12, timestamp: Date.now() },
    },
  }
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

function selectPersonalWaypointFromMap(waypointId: string): HTMLButtonElement {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  const onSelectWaypoint = appHarness.commands.setPersonalWaypoints.mock.calls.at(-1)?.[2]
  if (typeof onSelectWaypoint !== 'function') throw new Error('Personal Waypoint map selection callback is missing')
  act(() => onSelectWaypoint(waypointId, trigger))
  return trigger
}

/**
 * The collection screen's commands live in its one overflow menu, so opening a command is two
 * steps. Returns the command group so a caller can read its items with `within`.
 */
async function openWaypointListMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const existing = screen.queryByRole('group', { name: 'Waypoint list commands' })
  if (existing) return existing
  await user.click(screen.getByRole('button', { name: 'Waypoint list options' }))
  return screen.getByRole('group', { name: 'Waypoint list commands' })
}

/** Runs one collection command (`Edit list`/`Done`, or `Clear all`) from the overflow menu. */
async function chooseWaypointListCommand(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  const menu = await openWaypointListMenu(user)
  await user.click(within(menu).getByRole('button', { name: label }))
}

/** Runs one record command (`Edit waypoint`/`Delete waypoint`) from the details overflow menu. */
async function chooseWaypointAction(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
  const menu = screen.getByRole('group', { name: 'Waypoint actions' })
  await user.click(within(menu).getByRole('button', { name: label }))
}

beforeEach(() => {
  appHarness.communityWaypoints = []
  mockDesktopViewport()
  appHarness.mountCount = 0
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [] })
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: () => [] })
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
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).getAnimations
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).getAnimations
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
  appHarness.commands.enableLocationTracking.mockReset()
  appHarness.commands.suspendMobileRoutes.mockReset()
  appHarness.commands.enterMobileRoutes.mockReset()
  appHarness.commands.selectMobileRoute.mockReset()
  appHarness.commands.setPersonalWaypoints.mockReset()
  appHarness.commands.setWaypointPlacement.mockReset()
  appHarness.commands.setCommunityWaypoints.mockReset()
  appHarness.commands.focusPersonalWaypoint.mockReset()
  appHarness.commands.captureCamera.mockClear()
  appHarness.commands.restoreCamera.mockReset()
  appHarness.commands.focusCommunityWaypoint.mockReset()
})

describe('desktop shared navigation shell', () => {
  it.each(['desktop', 'mobile'] as const)(
    'lets people navigate by keyboard to an anonymous Community Waypoint suggestion on %s',
    async (viewport) => {
      if (viewport === 'mobile') mockMobileViewport()
      const user = userEvent.setup()
      let submittedBody: unknown = null
      const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        submittedBody = JSON.parse(String(init?.body)) as unknown
        return new Response(JSON.stringify({ status: 'received' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        })
      })
      vi.stubGlobal('fetch', fetcher)
      setActiveLocationFix()
      render(<App />)

      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.tab()
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Suggest a waypoint' }))
      await user.keyboard('{Enter}')

      expect(await screen.findByRole('heading', { name: 'Suggest a waypoint' })).toBeTruthy()
      expect(screen.getByText('Using current location')).toBeTruthy()
      await user.click(screen.getByRole('radio', { name: 'Water cooler' }))
      await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

      expect(await screen.findByRole('heading', { name: 'Suggestion received' })).toBeTruthy()
      expect(submittedBody).toEqual({
        kind: 'new-place',
        category: 'water_cooler',
        longitude: 103.7844,
        latitude: 1.2933,
      })
      expect(document.body.textContent).not.toMatch(/private repository|issue #\d+|photoEvidence|email/i)
      expect(document.body.textContent).toContain('review it before publication')
    },
  )

  it('requests current location and uses the arriving fix for a new suggestion', async () => {
    const user = userEvent.setup()
    const view = render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Suggest a waypoint' }))

    expect(appHarness.commands.enableLocationTracking).toHaveBeenCalledOnce()
    expect(screen.getByText('Getting your current location…')).toBeTruthy()

    appHarness.state = {
      ...(appHarness.state as Record<string, unknown>),
      location: {
        status: 'tracking',
        latestFix: { longitude: 103.8, latitude: 1.3, accuracy: 7, timestamp: Date.now() },
      },
    }
    view.rerender(<App />)

    await waitFor(() => expect(screen.getByText('1.300000° N')).toBeTruthy())
    expect(screen.getByText('103.800000° E')).toBeTruthy()
    expect(screen.getByText('Using current location')).toBeTruthy()
    expect(screen.queryByText(/Current location accuracy/)).toBeNull()
  })

  it('restarts stale location tracking before placing a new suggestion', async () => {
    const user = userEvent.setup()
    appHarness.state = {
      ...(appHarness.state as Record<string, unknown>),
      location: {
        status: 'stale',
        latestFix: { longitude: 103.8, latitude: 1.3, accuracy: 7, timestamp: Date.now() - 180_000 },
      },
    }
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Suggest a waypoint' }))

    expect(appHarness.commands.locateUser).toHaveBeenCalledOnce()
    expect(appHarness.commands.enableLocationTracking).not.toHaveBeenCalled()
    expect(screen.getByText('Getting your current location…')).toBeTruthy()
  })

  it.each(['desktop', 'mobile'] as const)(
    'opens the empty Explore suggestion action and restores focus on %s',
    async (viewport) => {
      if (viewport === 'mobile') mockMobileViewport()
      const user = userEvent.setup()
      render(<App />)

      await user.click(screen.getByRole('button', { name: 'Explore' }))
      await user.click(screen.getByRole('button', { name: 'Community' }))
      const trigger = await screen.findByRole('button', { name: 'Suggest a waypoint' })
      await user.click(trigger)

      expect(screen.getByRole('radio', { name: 'Water cooler' })).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(document.activeElement).toBe(trigger))
    },
  )

  it.each(['desktop', 'mobile'] as const)(
    'opens a correction from approved Community Waypoint details and restores focus on %s',
    async (viewport) => {
    if (viewport === 'mobile') mockMobileViewport()
    const user = userEvent.setup()
    let submittedBody: unknown = null
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      submittedBody = JSON.parse(String(init?.body)) as unknown
      return new Response(JSON.stringify({ status: 'received' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const waypoint: CommunityWaypoint = {
      id: 'cw-water-001',
      displayLabel: 'Water cooler at UTown',
      category: 'water_cooler',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      updatedAt: '2026-10-26',
    }
    appHarness.communityWaypoints = [waypoint]
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Community' }))
    await user.click(screen.getByRole('switch', { name: 'Show Water cooler on map' }))
    await waitFor(() => expect(appHarness.commands.setCommunityWaypoints)
      .toHaveBeenLastCalledWith([waypoint], expect.any(Function)))
    const mapTrigger = document.createElement('button')
    document.body.append(mapTrigger)
    const onSelect = appHarness.commands.setCommunityWaypoints.mock.calls.at(-1)?.[1]
    act(() => onSelect?.(waypoint.id, mapTrigger))

    const correctionTrigger = await screen.findByRole('button', { name: 'Suggest a correction' })
    await user.click(correctionTrigger)

    expect(await screen.findByText(/^Correction for/)).toBeTruthy()
    expect(screen.queryByLabelText(/Waypoint name/)).toBeNull()
    await user.type(screen.getByLabelText(/What needs correcting\?/), 'It has moved to the next floor.')
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))

    expect(await screen.findByRole('heading', { name: 'Correction received' })).toBeTruthy()
    expect(submittedBody).toMatchObject({
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: 'It has moved to the next floor.',
      longitude: waypoint.coordinate.longitude,
      latitude: waypoint.coordinate.latitude,
    })
    expect(submittedBody).not.toHaveProperty('name')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(document.activeElement).toBe(correctionTrigger))
    expect(screen.getByRole('heading', { name: waypoint.displayLabel })).toBeTruthy()
    },
  )

  it.each(['desktop', 'mobile'] as const)(
    'reuses map placement for suggestions and preserves form entries on %s',
    async (viewport) => {
    if (viewport === 'mobile') mockMobileViewport()
    const user = userEvent.setup()
    let submittedBody: unknown = null
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      submittedBody = JSON.parse(String(init?.body)) as unknown
      return new Response(JSON.stringify({ status: 'received' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Suggest a waypoint' }))
    await user.click(screen.getByRole('radio', { name: 'Water cooler' }))
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))

    expect(screen.getByRole('region', { name: 'Adjust waypoint location' })).toBeTruthy()
    const unavailableCurrentLocation = screen.getByRole('button', { name: 'Use current location' })
    expect(unavailableCurrentLocation.getAttribute('aria-disabled')).toBe('true')
    expect(unavailableCurrentLocation.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(true)
    const placementCall = appHarness.commands.setWaypointPlacement.mock.calls.at(-1)
    expect(placementCall?.[1]).toBe(true)
    const onMapChange = placementCall?.[2] as ((coordinate: readonly [number, number]) => void) | undefined
    act(() => onMapChange?.([103.8, 1.3]))
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))

    expect(screen.getByText('1.300000° N')).toBeTruthy()
    expect(screen.getByText('103.800000° E')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Adjust on map' }))
    await user.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(await screen.findByRole('heading', { name: 'Suggestion received' })).toBeTruthy()
    expect(submittedBody).toMatchObject({ longitude: 103.8, latitude: 1.3 })
    },
  )

  it('loads approved Community Waypoints into the map and opens marker details in Explore', async () => {
    const user = userEvent.setup()
    const waypoint: CommunityWaypoint = {
      id: 'cw-water-001',
      displayLabel: 'Water cooler at UTown',
      category: 'water_cooler',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      updatedAt: '2026-10-26',
    }
    appHarness.communityWaypoints = [waypoint]
    localStorage.setItem(COMMUNITY_VISIBILITY_KEY, JSON.stringify(['water_cooler']))
    render(<App />)

    await waitFor(() => expect(appHarness.commands.setCommunityWaypoints)
      .toHaveBeenLastCalledWith([waypoint], expect.any(Function)))
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const onSelect = appHarness.commands.setCommunityWaypoints.mock.calls.at(-1)?.[1]
    expect(onSelect).toBeTypeOf('function')

    act(() => onSelect?.(waypoint.id, trigger))

    expect(await screen.findByRole('heading', { name: waypoint.displayLabel })).toBeTruthy()
    expect(screen.queryByText('NUS Campus Facilities')).toBeNull()
    expect(appHarness.commands.focusCommunityWaypoint).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Community Waypoints' }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))

    act(() => onSelect?.(waypoint.id, trigger))
    await screen.findByRole('heading', { name: waypoint.displayLabel })
    await user.click(screen.getByRole('button', { name: 'Bus routes' }))
    await user.click(screen.getByRole('button', { name: 'Community' }))
    expect(screen.getByRole('group', { name: 'Categories' })).toBeTruthy()

    await user.click(screen.getByRole('switch', { name: 'Show Water cooler on map' }))
    await waitFor(() => expect(appHarness.commands.setCommunityWaypoints)
      .toHaveBeenLastCalledWith([], expect.any(Function)))
  })

  it('opens the selected route from stop timings after leaving Community mode', async () => {
    const user = userEvent.setup()
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
    appHarness.commands.enterMobileRoutes.mockImplementation(() => {
      const current = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
      appHarness.state = {
        ...current,
        exploreState: { ...current.exploreState, mode: 'bus-routes' },
      }
    })
    appHarness.commands.selectMobileRoute.mockImplementation((routeId: string) => {
      const current = appHarness.state as ReturnType<typeof createInitialNavigationSessionState>
      appHarness.state = { ...current, selectedRouteId: routeId }
    })

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    await user.click(screen.getByRole('button', { name: 'Community' }))
    expect(screen.getByRole('group', { name: 'Categories' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Stops' }))
    act(() => expect(appHarness.onStopSelected?.('STOP-A')).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'View A1 route details' }))

    expect(await screen.findByRole('button', { name: 'Bus routes', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Route A1', pressed: true })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull()
  })

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

  it('keeps the navigation session mounted and refreshes map callbacks across viewport changes', async () => {
    const user = userEvent.setup()
    const setMobileViewport = mockChangeableViewport(false)
    render(<App />)
    expect(appHarness.mountCount).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => appHarness.onMapStopInteraction?.('STOP-A'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current'))
      .toBe('page'))

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    act(() => setMobileViewport(true))
    expect(appHarness.mountCount).toBe(1)

    act(() => appHarness.onMapStopInteraction?.('STOP-A'))
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page')
  })

  it('switches to the unified Explore tab opening on Bus routes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(screen.getByRole('region', { name: 'Bus routes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bus routes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find venue' })).toBeTruthy()
    expect(document.getElementById('stops-panel')?.hasAttribute('hidden')).toBe(true)
  })

  it('starts the route session when desktop Explore opens on Bus routes', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Explore opens on Bus routes, and a route chip only works while a route session is active.
    // Nothing else starts one on desktop, so entering the tab must.
    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(appHarness.commands.enterMobileRoutes).toHaveBeenCalled()
  })

  it('preserves a manual Explore view when switching top-level tabs on desktop', async () => {
    const user = userEvent.setup()
    // A view the rider chose earlier in the session; the initial view is Bus routes.
    appHarness.state = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
      exploreState: {
        ...createInitialNavigationSessionState().exploreState,
        mode: 'venue-search',
      },
    }
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    expect(screen.getByRole('searchbox', { name: 'Find a venue' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Stops' }))
    await user.click(screen.getByRole('button', { name: 'Explore' }))

    expect(screen.getByRole('searchbox', { name: 'Find a venue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find venue' }).getAttribute('aria-pressed')).toBe('true')
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

    // Explore opens on Bus routes, so that is the view this stop returns to.
    await user.click(screen.getByRole('button', { name: 'Back to bus routes' }))
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
  it('opens Release notes as a full mobile destination and returns to the More menu', async () => {
    mockMobileViewport()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Release notes' }))
    const panel = document.querySelector('.more-panel-surface')
    expect(panel?.getAttribute('data-page')).toBe('release-notes')
    expect(panel?.getAttribute('data-detent')).toBe('full')
    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(panel?.getAttribute('data-page')).toBe('menu')
  })

  it('opens Release notes as a dedicated desktop destination and returns through More on Escape', async () => {
    mockDesktopViewport()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Release notes' }))
    const panel = document.querySelector('.more-panel-surface')
    expect(panel?.getAttribute('data-page')).toBe('release-notes')
    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeTruthy()
    expect(screen.getByText('No release history is available yet.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to previous view' }))

    await user.keyboard('{Escape}')
    expect(panel?.getAttribute('data-page')).toBe('menu')
    await user.keyboard('{Escape}')
    expect(panel?.getAttribute('data-page')).toBe('closed')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }))
  })

  it('keeps the expanded mobile waypoint sheet open when Escape comes from the collection options trigger', async () => {
    mockMobileViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [{
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    const sheet = document.querySelector('.more-panel-surface')
    expect(sheet?.getAttribute('data-detent')).toBe('full')
    // The collection has exactly one overflow trigger; its commands live inside it.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)

    // An open menu owns Escape: the first press only closes the menu.
    const menu = await openWaypointListMenu(user)
    expect(within(menu).getByRole('button', { name: 'Clear all' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Waypoint list commands' })).toBeNull()
    expect(sheet?.getAttribute('data-page')).toBe('waypoints')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Waypoint list options' }))

    await user.keyboard('{Escape}')

    // Escape from the trigger itself steps back one More page; it never tears down the whole sheet.
    expect(sheet?.getAttribute('data-open')).toBe('true')
    expect(sheet?.getAttribute('data-page')).toBe('menu')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to previous view' }))

    await user.keyboard('{Escape}')

    expect(sheet?.getAttribute('data-open')).toBe('false')
  })

  it('renames a category by keyboard and keeps the pending edit when Escape cancels the rename', async () => {
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [{
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')

    // Stage one rename, so losing the edit session would lose visible work.
    await user.click(screen.getByRole('button', { name: 'Rename Rest spot category' }))
    const firstInput = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(firstInput)
    await user.type(firstInput, 'Break spot{Enter}')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()

    // A rename owns Escape. The application also listens for Escape on `window` in the capture
    // phase, so without the header's opt-out this keypress stepped the whole panel back to the More
    // menu and silently discarded the staged rename.
    await user.click(screen.getByRole('button', { name: 'Rename Break spot category' }))
    // The field must hold focus synchronously. Escape is handled by the application on `window` in
    // the capture phase, so a keypress made while `document.activeElement` is `body` reaches that
    // handler instead of the header and closes the whole panel, discarding the pending edit.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Rename Break spot category' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('textbox', { name: 'Rename Break spot category' })).toBeNull()
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('waypoints')
    // The earlier staged rename survived, and nothing was written.
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints[0].category).toBe('Rest spot')
  })

  it('closes only the waypoints page on Escape from the collection options trigger', async () => {
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [{
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    const trigger = screen.getByRole('button', { name: 'Waypoint list options' })
    trigger.focus()

    await user.keyboard('{Escape}')

    // Escape leaves the waypoints page for the More menu and keeps the panel open; the saved
    // place is untouched and the list actions are gone with their page.
    expect(screen.queryByRole('button', { name: 'Waypoint list options' })).toBeNull()
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('menu')
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('true')
    expect(JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints).toHaveLength(1)
  })

  it('uses the shared Navigate action from the list and details', async () => {
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      note: 'Near the garden',
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    // Groups start collapsed; the row itself is now only a way into details.
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))
    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('waypoint-details')

    await user.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(appHarness.commands.navigateToEndpoint).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'personal-waypoint',
      id: waypoint.id,
      label: waypoint.name,
      coordinate: waypoint.coordinate,
    }))
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Explore' }))
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page')
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    const mapTrigger = selectPersonalWaypointFromMap(waypoint.id)
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('waypoint-details')
    await user.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(appHarness.commands.navigateToEndpoint).toHaveBeenCalledTimes(2)
    expect(appHarness.commands.navigateToEndpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'personal-waypoint',
      id: waypoint.id,
      label: waypoint.name,
      coordinate: waypoint.coordinate,
    }))
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    mapTrigger.remove()
  })

  it.each(['desktop', 'mobile'])('focuses the already-active Plan and reopens waypoint details after Navigate on %s', async (viewport) => {
    if (viewport === 'mobile') mockMobileViewport()
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    const otherWaypoint = {
      ...waypoint,
      id: '00000000-0000-4000-8000-000000000022',
      name: 'Library seat',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1, waypoints: [waypoint, otherWaypoint],
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Plan' }))

    for (const selected of [waypoint, waypoint, otherWaypoint]) {
      const trigger = selectPersonalWaypointFromMap(selected.id)
      const panel = document.querySelector('.more-panel-surface')
      expect(panel?.getAttribute('data-page')).toBe('waypoint-details')
      expect(panel?.getAttribute('data-open')).toBe('true')
      expect(screen.getByRole('heading', { name: selected.name })).toBeTruthy()
      const navigate = screen.getByRole('button', { name: 'Navigate' })
      navigate.focus()
      await user.keyboard('{Enter}')

      expect(appHarness.commands.navigateToEndpoint).toHaveBeenLastCalledWith(expect.objectContaining({
        kind: 'personal-waypoint', id: selected.id,
      }))
      expect(panel?.getAttribute('data-open')).toBe('false')
      expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement?.closest('.plan-content-panel, .plan-sheet')).toBeTruthy()
      trigger.remove()
    }
  })

  it.each(['desktop', 'mobile'])('moves focus into Plan when Navigate closes More over an already-active Plan view on %s', async (viewport) => {
    if (viewport === 'mobile') mockMobileViewport()
    else mockDesktopViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [{
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))
    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))
    await user.click(screen.getByRole('button', { name: 'Navigate' }))

    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(document.activeElement?.closest('.plan-sheet')).toBeTruthy()
    expect(document.activeElement?.matches('input, select, button')).toBe(true)
  })

  it('uses Escape to cancel a keyboard reorder before More handles it', async () => {
    const user = userEvent.setup()
    const firstWaypoint = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    const secondWaypoint = {
      ...firstWaypoint,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Library seat',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [firstWaypoint, secondWaypoint] }))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')
    const waypointsList = screen.getByRole('list', { name: 'Saved places' })
    const handle = within(waypointsList).getByRole('button', { name: 'Reorder Quiet bench' })
    handle.focus()
    await user.keyboard('{Space}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Escape}')

    expect(waypointsList.getAttribute('data-editing')).toBe('true')
    expect(screen.getByText('Reordering Quiet bench canceled.')).toBeTruthy()
    // Rows no longer repeat the category: the group heading above them already names it.
    expect(within(waypointsList).getAllByRole('listitem').map((row) => row.textContent?.trim()))
      .toEqual(['Quiet bench', 'Library seat'])
    expect(JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints.map(({ id }: { id: string }) => id))
      .toEqual([firstWaypoint.id, secondWaypoint.id])
  })

  it('preserves category visibility drafts and expands groups in place', async () => {
    const quietBench = {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      note: 'Near the garden',
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    const cafe = {
      ...quietBench,
      id: '00000000-0000-4000-8000-000000000012',
      name: 'Campus cafe',
      category: 'Food & drink',
    }
    const categoryVisibilityKey = 'navus:personal-waypoint-category-visibility:v1'
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1,
      waypoints: [quietBench, cafe],
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    const panel = document.querySelector('.more-panel-surface')
    expect(screen.getByRole('button', { name: 'Add waypoint' })).toBeTruthy()
    // The collection screen has exactly one overflow trigger, and it owns the list commands.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)

    // Map visibility is a checkbox per category now: it is a membership question, and the ✕ the
    // row used before already means "delete" elsewhere on this screen. Its state is only a draft
    // while the picker is open, so nothing is written until Done.
    const visibilityPicker = () => within(screen.getByRole('group', { name: 'Category places and map visibility' }))
    const categoryRowNames = (): (string | null)[] => [...document.querySelectorAll(
      '.personal-waypoint-category-options .personal-waypoint-category-name',
    )].map((element) => element.textContent)
    const categoryCheckbox = (category: string): HTMLInputElement => screen.getByRole(
      'checkbox',
      { name: `Show ${category} on the map` },
    ) as HTMLInputElement

    await user.click(screen.getByRole('button', { name: /Categories/ }))
    // Category rows are a checkbox plus a name; there is no category screen to open and no
    // per-row action button.
    expect(visibilityPicker().queryByRole('button', { name: /^Open / })).toBeNull()
    expect(visibilityPicker().queryAllByRole('button')).toHaveLength(0)
    expect(categoryCheckbox('Food & drink').checked).toBe(true)
    const orderBefore = categoryRowNames()
    await user.click(categoryCheckbox('Food & drink'))
    expect(categoryCheckbox('Food & drink').checked).toBe(false)
    // Ticking a box must not move its row: the list keeps one alphabetical order regardless of
    // which categories are shown, so the thing just clicked stays where it was clicked.
    expect(categoryRowNames()).toEqual(orderBefore)
    expect(localStorage.getItem(categoryVisibilityKey)).toBeNull()

    // The list is one grouped collection: both categories are reachable, and expanding a group
    // happens in place without changing page.
    await user.click(screen.getByRole('button', { name: /Categories/ }))
    expect(panel?.getAttribute('data-page')).toBe('waypoints')
    expect(screen.getByRole('region', { name: 'Saved places' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))
    expect(panel?.getAttribute('data-page')).toBe('waypoints')
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add waypoint' })).toBeTruthy()

    // Places are navigational now: the row opens that place's details, and the camera focus that
    // used to live on a per-row "show on map" action is part of opening details (see #669).
    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))
    expect(panel?.getAttribute('data-page')).toBe('waypoint-details')

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(panel?.getAttribute('data-page')).toBe('waypoints')

    // The draft survived the round trip through details, and cancelling discards it.
    await user.click(screen.getByRole('button', { name: /Categories/ }))
    expect(categoryCheckbox('Food & drink').checked).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(localStorage.getItem(categoryVisibilityKey)).toBeNull()

    await user.click(screen.getByRole('button', { name: /Categories/ }))
    // Cancel discarded the draft, so the checkbox is back to what is actually saved.
    expect(categoryCheckbox('Food & drink').checked).toBe(true)
  })

  it('opens waypoint details, edits the record, and confirms deletion', async () => {
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      note: 'Near the garden',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))
    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))

    const panel = document.querySelector('.more-panel-surface')
    expect(panel?.getAttribute('data-page')).toBe('waypoint-details')
    expect(screen.getByText('Near the garden')).toBeTruthy()
    // A details screen is allowed one overflow trigger, and Navigate is its only visible action.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)
    const details = document.querySelector('.personal-waypoint-details') as HTMLElement
    expect(within(details).getAllByRole('button')
      .map((button) => button.textContent || button.getAttribute('aria-label')))
      .toEqual(['Waypoint actions', 'Navigate'])

    await chooseWaypointAction(user, 'Edit waypoint')
    expect(panel?.getAttribute('data-page')).toBe('editing-waypoint')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Shaded bench')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(panel?.getAttribute('data-page')).toBe('waypoint-details')
    expect(screen.getByRole('heading', { name: 'Shaded bench' })).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints[0]
    expect(saved).toMatchObject({
      id: waypoint.id,
      name: 'Shaded bench',
      createdAt: waypoint.createdAt,
    })
    expect(saved.updatedAt).not.toBe(waypoint.updatedAt)

    await chooseWaypointAction(user, 'Delete waypoint')
    expect(confirm).toHaveBeenCalledWith('Delete "Shaded bench"? This cannot be undone.')
    expect(panel?.getAttribute('data-page')).toBe('waypoint-details')
    expect(JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints)
      .toHaveLength(1)

    confirm.mockReturnValue(true)
    await chooseWaypointAction(user, 'Delete waypoint')
    expect(panel?.getAttribute('data-page')).toBe('waypoints')
    expect(JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}').waypoints).toEqual([])
    confirm.mockRestore()
  })

  it('shows the latest saved waypoint before allowing a conflicted edit to replace it', async () => {
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      note: 'Near the garden',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    const storageKey = 'navus:personal-waypoints:v1'
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: /Categories/ }))
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))
    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))
    await chooseWaypointAction(user, 'Edit waypoint')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'My unsaved edit')

    const latest = { ...waypoint, name: 'Bench moved in another tab', note: 'Latest saved note' }
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, waypoints: [latest] }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByRole('heading', { name: 'Latest saved version' })).toBeTruthy()
    expect(screen.getByText('Bench moved in another tab')).toBeTruthy()
    expect(screen.getByText('Latest saved note')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}').waypoints[0].name)
      .toBe('Bench moved in another tab')
    expect(screen.getByRole('button', { name: 'Replace saved version' })).toBeTruthy()

    const latestAgain = { ...latest, name: 'Bench changed again', note: 'Newest saved note' }
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, waypoints: [latestAgain] }))
    await user.click(screen.getByRole('button', { name: 'Replace saved version' }))

    expect(screen.getByText('Bench changed again')).toBeTruthy()
    expect(screen.getByText('Newest saved note')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}').waypoints[0].name)
      .toBe('Bench changed again')
    await user.click(screen.getByRole('button', { name: 'Replace saved version' }))

    expect(screen.getByRole('heading', { name: 'My unsaved edit' })).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}').waypoints[0]
    expect(saved.name).toBe('My unsaved edit')
    expect(saved.note).toBe('Near the garden')
  })

  it('restores the More page and sheet position after details opened from a map marker', async () => {
    mockMobileViewport()
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const panel = document.querySelector<HTMLElement>('.more-panel-surface')
    expect(panel?.dataset.detent).toBe('full')

    const trigger = document.createElement('button')
    document.body.append(trigger)
    const onSelectWaypoint = appHarness.commands.setPersonalWaypoints.mock.calls.at(-1)?.[2]
    expect(onSelectWaypoint).toBeTypeOf('function')
    act(() => onSelectWaypoint?.(waypoint.id, trigger))
    expect(panel?.dataset.page).toBe('waypoint-details')

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))

    expect(panel?.dataset.page).toBe('settings')
    expect(panel?.dataset.detent).toBe('full')
    // The camera snapshot taken before details focused the waypoint returns exactly.
    expect(appHarness.commands.restoreCamera).toHaveBeenCalledOnce()
    expect(appHarness.commands.restoreCamera).toHaveBeenCalledWith({
      center: [103.7764, 1.2966],
      zoom: 17.25,
      bearing: -32,
      pitch: 45,
    })
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('returns focus to the list row that opened details once the collection is back', async () => {
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000036',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Expand Rest spot' }))

    await user.click(screen.getByRole('button', { name: 'Open Quiet bench details' }))
    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))

    // The row is rebuilt with the restored page, so its label re-finds it rather than focus
    // landing on the list's first control.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Quiet bench details' }))
  })

  it('captures the camera and focuses each opened place once through the application seam', async () => {    mockDesktopViewport()
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    const otherWaypoint = {
      ...waypoint,
      id: '00000000-0000-4000-8000-000000000032',
      name: 'Library seat',
      coordinate: { longitude: 103.77, latitude: 1.3 },
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1, waypoints: [waypoint, otherWaypoint],
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))

    const firstTrigger = selectPersonalWaypointFromMap(waypoint.id)
    expect(appHarness.commands.captureCamera).toHaveBeenCalledOnce()
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenCalledOnce()
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenLastCalledWith(waypoint, undefined)

    // Re-renders while the same place stays open, such as an unrelated state change, must not move
    // the camera again.
    await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
    await user.keyboard('{Escape}')
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenCalledOnce()

    // Switching places focuses the newly selected one once and keeps the original snapshot.
    const secondTrigger = selectPersonalWaypointFromMap(otherWaypoint.id)
    expect(screen.getByRole('heading', { name: 'Library seat' })).toBeTruthy()
    expect(appHarness.commands.captureCamera).toHaveBeenCalledOnce()
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenCalledTimes(2)
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenLastCalledWith(otherWaypoint, undefined)

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(appHarness.commands.restoreCamera).toHaveBeenCalledOnce()
    expect(appHarness.commands.restoreCamera).toHaveBeenCalledWith({
      center: [103.7764, 1.2966],
      zoom: 17.25,
      bearing: -32,
      pitch: 45,
    })
    firstTrigger.remove()
    secondTrigger.remove()
  })

  it('follows the normal Plan workflow instead of restoring the camera when navigating from details', async () => {
    mockDesktopViewport()
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000033',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    const trigger = selectPersonalWaypointFromMap(waypoint.id)

    await user.click(screen.getByRole('button', { name: 'Navigate' }))

    expect(appHarness.commands.navigateToEndpoint).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'personal-waypoint', id: waypoint.id,
    }))
    // Navigating is a new journey, so the previous view must not snap back under the new trip.
    expect(appHarness.commands.restoreCamera).not.toHaveBeenCalled()
    trigger.remove()
  })

  it('focuses waypoint details above their own 60% mobile sheet and closes back to the camera', async () => {
    mockMobileViewport()
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000034',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      markerColor: 'blue',
      markerIcon: 'dot',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)
    const trigger = selectPersonalWaypointFromMap(waypoint.id)

    // Details cover 60% of the screen plus the shared overlay margin, so the marker stays above them.
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenCalledOnce()
    expect(appHarness.commands.focusPersonalWaypoint).toHaveBeenCalledWith(waypoint, {
      top: 0,
      right: 0,
      bottom: viewportHeight * 0.6 + 12,
      left: 0,
    })
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-detent')).toBe('partial')

    // Closing restores the camera once, whether through the back control or a keyboard Escape.
    await user.keyboard('{Escape}')
    expect(appHarness.commands.restoreCamera).toHaveBeenCalledOnce()
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    trigger.remove()
  })

  it('returns focus to More when deleting a waypoint opened from the map', async () => {
    const waypoint = {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Quiet bench',
      category: 'Rest spot',
      coordinate: { longitude: 103.78, latitude: 1.29 },
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    }
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({ version: 1, waypoints: [waypoint] }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))

    const marker = document.createElement('button')
    document.body.append(marker)
    const onSelectWaypoint = appHarness.commands.setPersonalWaypoints.mock.calls.at(-1)?.[2]
    act(() => onSelectWaypoint?.(waypoint.id, marker))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('waypoint-details')

    marker.remove()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await chooseWaypointAction(user, 'Delete waypoint')

    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('settings')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to previous view' }))
    confirm.mockRestore()
  })

  it('opens Add waypoint directly as a form at the map centre', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))

    expect(screen.getByLabelText('Name')).toBeTruthy()
    const location = screen.getByRole('group', { name: 'Location' })
    expect(location.textContent).toContain('Latitude1.000000°')
    expect(location.textContent).toContain('Longitude103.000000°')
    expect(screen.queryByRole('region', { name: 'Place personal waypoint' })).toBeNull()
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(false)
  })

  it('announces waypoint validation through the persistent app status region', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    const statusRegion = screen.getByRole('alert', { name: 'Personal waypoint status' })
    expect(statusRegion.textContent).toBe('')

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))

    expect(screen.getByRole('alert', { name: 'Personal waypoint status' })).toBe(statusRegion)
    expect(statusRegion.textContent).toBe('Check the highlighted fields before saving.')
  })

  it('repositions on the map and returns to the waypoint form with entries preserved', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.type(screen.getByLabelText('Name'), 'Quiet bench')
    await user.type(screen.getByLabelText('Category'), 'Rest spot')
    await user.type(screen.getByLabelText('Note (optional)'), 'Near the garden')
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))

    expect(screen.getByRole('region', { name: 'Adjust waypoint location' })).toBeTruthy()
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(true)
    const placementCall = appHarness.commands.setWaypointPlacement.mock.calls.at(-1)
    expect(placementCall?.[1]).toBe(true)
    const onMapChange = placementCall?.[2] as ((coordinate: readonly [number, number]) => void) | undefined
    expect(onMapChange).toBeTypeOf('function')
    act(() => onMapChange?.([104.25, 1.5]))
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Quiet bench')
    expect((screen.getByLabelText('Category') as HTMLInputElement).value).toBe('Rest spot')
    expect((screen.getByLabelText('Note (optional)') as HTMLTextAreaElement).value).toBe('Near the garden')
    const location = screen.getByRole('group', { name: 'Location' })
    expect(location.textContent).toContain('Latitude1.500000°')
    expect(location.textContent).toContain('Longitude104.250000°')
    expect(document.querySelector('.navigation-column')?.hasAttribute('hidden')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))
    act(() => appHarness.onMapMovingChange?.(true))
    expect(screen.getByRole('button', { name: 'Use map centre' }).getAttribute('aria-disabled')).toBe('true')
    act(() => {
      appHarness.onMapCenterChange?.([105, 2])
      appHarness.onMapMovingChange?.(false)
    })
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit coordinates' }))
    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Use map centre' }))
    await user.keyboard('{Enter}')
    expect(screen.getByText('2.000000° N · 105.000000° E')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))
    const updatedLocation = screen.getByRole('group', { name: 'Location' })
    expect(updatedLocation.textContent).toContain('Latitude2.000000°')
    expect(updatedLocation.textContent).toContain('Longitude105.000000°')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Quiet bench')
  })

  it('uses the latest current-location fix for a Community Waypoint placement', async () => {
    mockDesktopViewport()
    setActiveLocationFix()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Suggest a waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))

    const currentLocationButton = screen.getByRole('button', { name: 'Use current location' })
    expect(currentLocationButton.getAttribute('aria-disabled')).toBeNull()
    await user.click(currentLocationButton)
    expect(screen.getByText('1.293300° N · 103.784400° E')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))
    const location = screen.getByRole('group', { name: 'Location' })
    expect(location.textContent).toContain('Latitude1.293300°')
    expect(location.textContent).toContain('Longitude103.784400°')
    expect(location.textContent).toContain('Using current location')
  })

  it('applies a pasted coordinate, pans the map to it and returns it to the form', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.type(screen.getByLabelText('Name'), 'Quiet bench')
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))
    appHarness.commands.panToCoordinate.mockClear()

    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    const input = screen.getByRole('textbox', { name: 'Selected location' })
    await user.clear(input)
    await user.type(input, '1.2966, 103.7764{Enter}')

    expect(appHarness.commands.panToCoordinate).toHaveBeenCalledWith([103.7764, 1.2966])
    expect(screen.getByText('1.296600° N · 103.776400° E')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))
    const location = screen.getByRole('group', { name: 'Location' })
    expect(location.textContent).toContain('Latitude1.296600°')
    expect(location.textContent).toContain('Longitude103.776400°')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Quiet bench')
  })

  it('closes coordinate entry on Escape without leaving the Adjust location screen', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Adjust on map' }))
    await user.click(screen.getByRole('button', { name: 'Edit coordinates' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('textbox', { name: 'Selected location' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Adjust waypoint location' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit coordinates' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Adjust waypoint location' })).toBeNull()
  })

  it('creates a Personal Waypoint only after Save', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('crypto', { randomUUID: () => '4a85589b-4941-4a85-8d47-7c46f5d47400' })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()

    await user.type(screen.getByLabelText('Name'), '  Quiet bench  ')
    await user.type(screen.getByLabelText('Category'), ' Study spot ')
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
    await user.type(screen.getByLabelText('Note (optional)'), ' Near the trees ')
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))

    const stored = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}')
    expect(stored.version).toBe(1)
    expect(stored.waypoints).toEqual([expect.objectContaining({
      name: 'Quiet bench', category: 'Study spot', note: 'Near the trees',
      coordinate: { longitude: 103, latitude: 1 },
    })])
    expect(screen.getByText('Waypoint saved.').getAttribute('role')).toBe('status')
    vi.unstubAllGlobals()
  })

  it('returns to browse mode after clearing and creating Personal Waypoints', async () => {
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
    vi.stubGlobal('crypto', { randomUUID: () => '4a85589b-4941-4a85-8d47-7c46f5d47400' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')
    const waypointsList = screen.getByRole('list', { name: 'Saved places' })
    expect(waypointsList.getAttribute('data-editing')).toBe('true')

    await chooseWaypointListCommand(user, 'Clear all')
    expect(confirm).toHaveBeenCalledWith(
      'Clear all personal waypoints, including places hidden by filters?',
    )
    await waitFor(() => expect(screen.getByText('No saved waypoints yet. Add a waypoint to start your list.')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.type(screen.getByLabelText('Name'), 'Coffee stop')
    await user.type(screen.getByLabelText('Category'), 'Food')
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))

    // Groups start collapsed, so a freshly created place's group must be expanded before its list
    // is reachable. There is only one category here, so the expand-all toggle is correctly absent
    // and the heading itself does the work.
    await user.click(screen.getByRole('button', { name: 'Expand Food' }))
    const createdWaypointsList = screen.getByRole('list', { name: 'Saved places' })
    expect(createdWaypointsList.getAttribute('data-editing')).toBe('false')

    await chooseWaypointListCommand(user, 'Edit list')
    expect(createdWaypointsList.getAttribute('data-editing')).toBe('true')
    // Add waypoint is replaced by the confirm/cancel pair while editing.
    expect(screen.queryByRole('button', { name: 'Add waypoint' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('list', { name: 'Saved places' }).getAttribute('data-editing')).toBe('false')
    expect(screen.getByRole('button', { name: 'Add waypoint' })).toBeTruthy()

    confirm.mockRestore()
    vi.unstubAllGlobals()
  })

  it('shows the saved list after Confirm instead of the pre-edit snapshot', async () => {
    // The edit session writes straight to the store, while this screen renders from the workflow's
    // own read result. Without a re-read after Confirm, the list falls back to what it read before
    // editing began, so a removed place reappears and the map keeps its marker until the page is
    // left and reopened. Confirmed in a browser; this is the same path.
    mockDesktopViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1,
      waypoints: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Quiet bench',
          category: 'Rest spot',
          coordinate: { longitude: 103.78, latitude: 1.29 },
          markerColor: 'blue',
          markerIcon: 'dot',
          createdAt: '2026-10-26T00:00:00.000Z',
          updatedAt: '2026-10-26T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Library seat',
          category: 'Rest spot',
          coordinate: { longitude: 103.79, latitude: 1.29 },
          markerColor: 'blue',
          markerIcon: 'dot',
          createdAt: '2026-10-26T00:00:00.000Z',
          updatedAt: '2026-10-26T00:00:00.000Z',
        },
      ],
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')
    // Edit mode expands every group, so the rows are reachable without opening anything.
    await user.click(screen.getByRole('button', { name: 'Remove Library seat' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    // Storage lost the place, so the screen must have lost it too, without a reload. Groups are
    // collapsed again now, so read the document rather than the (hidden) row list.
    const stored = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}')
    expect(stored.waypoints.map(({ name }: { name: string }) => name)).toEqual(['Quiet bench'])
    expect(document.body.textContent).not.toContain('Library seat')
    // And the heading counts what is left, rather than the pre-edit total.
    expect(screen.getByRole('button', { name: /^Expand Rest spot/ }).textContent).toContain('1 place')
  })

  it('keeps the collection page open when Escape dismisses a confirmation dialog', async () => {
    // The app steps the More panel back one page on Escape, listening on the window at capture
    // phase. A modal is opened on top of that page, so dismissing it used to navigate the page
    // behind it at the same time: Escape closed the dialog and left the person somewhere else.
    mockDesktopViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1,
      waypoints: [{
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Quiet bench',
        category: 'Rest spot',
        coordinate: { longitude: 103.78, latitude: 1.29 },
        markerColor: 'blue',
        markerIcon: 'dot',
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      }],
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')
    // Cancel asks first, because the edit is dirty; removing a place makes it dirty.
    // jsdom implements `dialog.open` but not the modal methods, so give the ConfirmDialog the
    // behaviour a browser provides for the duration of this test.
    Object.defineProperty(window.HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true },
    })
    Object.defineProperty(window.HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = false },
    })
    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const sheet = document.querySelector('.more-panel-surface')
    expect(sheet?.getAttribute('data-page')).toBe('waypoints')
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('data-owns-escape')).toBe('true')

    // Escape reaches the panel's window listener at capture phase before anything else. Without
    // the dialog declaring that it owns the key, that listener steps the page back from
    // `waypoints` to `menu` while the dialog is still on screen.
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }))
    })
    expect(sheet?.getAttribute('data-page')).toBe('waypoints')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
  })

  it('stages a category rename until Confirm, then writes it', async () => {
    // A rename used to write straight to the store while the screen still rendered the session's
    // copy, so storage held the new name, the list showed the old one, and the next Confirm failed
    // on the revision it had already moved. A rename is a list change like any other.
    mockDesktopViewport()
    localStorage.setItem('navus:personal-waypoints:v1', JSON.stringify({
      version: 1,
      waypoints: [{
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Quiet bench',
        category: 'Rest spot',
        coordinate: { longitude: 103.78, latitude: 1.29 },
        markerColor: 'blue',
        markerIcon: 'dot',
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      }],
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await chooseWaypointListCommand(user, 'Edit list')

    await user.click(screen.getByRole('button', { name: 'Rename Rest spot category' }))
    const field = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(field)
    await user.type(field, 'Break spot{Enter}')

    // The pending list shows the new name, and nothing has been written yet.
    expect(screen.getByRole('button', { name: /^Collapse Break spot/ })).toBeTruthy()
    const storedBeforeConfirm = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}')
    expect(storedBeforeConfirm.waypoints.map(({ category }: { category: string }) => category))
      .toEqual(['Rest spot'])

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    // Confirm writes it, and the screen shows the written state rather than the pre-edit one.
    const storedAfterConfirm = JSON.parse(localStorage.getItem('navus:personal-waypoints:v1') ?? '{}')
    expect(storedAfterConfirm.waypoints.map(({ category }: { category: string }) => category))
      .toEqual(['Break spot'])
    expect(screen.getByRole('button', { name: /^Expand Break spot/ })).toBeTruthy()
    expect(screen.getByText('List changes saved.')).toBeTruthy()
    // Still on the collection page: the Confirm was accepted, not refused as a conflict.
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('waypoints')
  })

  it('keeps cancelled and invalid waypoint drafts out of storage', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    // Cancel leaves the unchanged draft without saving anything.
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await user.click(screen.getByRole('button', { name: 'Save waypoint' }))
    expect(screen.getAllByText('Must not be empty.')).toHaveLength(2)
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
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
    expect(screen.getByText('Saved waypoint data needs recovery. It has been left untouched.').textContent).toContain('needs recovery')
    expect(localStorage.getItem('navus:personal-waypoints:v1')).toBe('{broken')
  })

  it('shows the nearby map crosshair on mobile and hides it while More is open', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(document.querySelector('.nearby-crosshair-area')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
  })

  it('keeps the Nearby crosshair mounted while presentation visibility follows sheet geometry', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Expand Stops panel' }))
    expect(screen.getByRole('region', { name: 'Stops' }).getAttribute('data-detent')).toBe('full')
    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
    expect(appHarness.commands.setVisibleCenterZoom).toHaveBeenLastCalledWith(true)

    await user.click(screen.getByRole('button', { name: 'Reduce Stops panel' }))
    expect(screen.getByRole('region', { name: 'Stops' }).getAttribute('data-detent')).toBe('partial')
    expect(document.querySelector('.nearby-crosshair-area')).toBeTruthy()
    expect(appHarness.commands.setVisibleCenterZoom).toHaveBeenLastCalledWith(true)
  })

  it('opens More at the shared partial mobile sheet detent and lets the user expand it', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
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
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)
    // Edit mode expands every group, so query the list after entering it.
    await chooseWaypointListCommand(user, 'Edit list')
    const waypointsList = screen.getByRole('list', { name: 'Saved places' })
    expect(waypointsList.getAttribute('data-editing')).toBe('true')
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench' }).hasAttribute('disabled'))
      .toBe(true)
    // Finishing an edit is a visible pair, not a menu entry, and it replaces Add waypoint.
    expect(screen.queryByRole('button', { name: 'Add waypoint' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByRole('button', { name: 'Add waypoint' })).toBeTruthy()

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

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
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

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))

    expect(screen.queryByRole('heading', { name: 'More' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
    expect(document.activeElement).toBe(moreButton)
  })

  it('manages favourite-stop order and membership in Settings', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    localStorage.setItem('navus:favorite-stops:v1', JSON.stringify(['STOP-A', 'STOP-B']))
    const view = render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settingsPanel = document.querySelector<HTMLElement>('.more-panel-content-scroll')
    if (!settingsPanel) throw new Error('Settings panel is missing')
    await user.click(within(settingsPanel).getByRole('button', { name: 'Favourites' }))
    expect(within(settingsPanel).queryByRole('button', { name: /More actions for/ })).toBeNull()
    await user.click(within(settingsPanel).getByRole('button', { name: 'Edit list' }))
    await user.click(within(settingsPanel).getByRole('button', { name: 'Move Stop B up' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual(['STOP-B', 'STOP-A']))

    view.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const reloadedSettingsPanel = document.querySelector<HTMLElement>('.more-panel-content-scroll')
    if (!reloadedSettingsPanel) throw new Error('Settings panel is missing after reload')
    await user.click(within(reloadedSettingsPanel).getByRole('button', { name: 'Favourites' }))
    const reloadedFavorites = screen.getByRole('list', { name: 'Favourite bus stops' })
    expect(within(reloadedFavorites).getAllByRole('listitem').map((row) => row.textContent?.trim()))
      .toEqual(['Stop B', 'Stop A'])
    await user.click(within(reloadedSettingsPanel).getByRole('button', { name: 'Edit list' }))
    await user.click(within(reloadedSettingsPanel).getByRole('button', { name: 'Remove Stop A from favourites' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual(['STOP-B']))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(within(reloadedSettingsPanel).getByRole('button', { name: 'Clear all' }))
    expect(confirm).toHaveBeenCalledWith('Clear all favourite bus stops?')
    confirm.mockRestore()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('navus:favorite-stops:v1') ?? '[]'))
      .toEqual([]))

    expect(screen.getByRole('heading', { name: 'Favourites' })).toBeTruthy()
    expect(screen.getByText('No favourites yet.')).toBeTruthy()
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

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))

    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.plan-sheet')?.getAttribute('data-detent')).toBe('full')

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Explore' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page')
  })

  it('returns from Settings to More and then back to the previous view', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('settings')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-page')).toBe('menu')
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to previous view' }))
    expect(document.querySelector('.more-panel-surface')?.getAttribute('data-open')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'More' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stops' }).getAttribute('aria-current')).toBe('page')
  })

  it('clears Settings search before Escape returns to More', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'waypoint')
    await user.keyboard('{Escape}')

    expect(search).toHaveProperty('value', '')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
  })

  it('clears Settings search with Escape when the clear button has focus', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'waypoint')
    const clearButton = screen.getByRole('button', { name: 'Clear Search settings' })
    await user.tab()
    expect(document.activeElement).toBe(clearButton)

    await user.keyboard('{Escape}')

    expect(search).toHaveProperty('value', '')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
  })

  it('clears mobile Settings search without collapsing the full sheet', async () => {
    mockMobileViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settingsSheet = document.querySelector<HTMLElement>('.more-panel-surface')
    expect(settingsSheet?.getAttribute('data-detent')).toBe('full')
    expect(settingsSheet?.querySelector('.mobile-sheet-handle-row')).toBeNull()
    expect(screen.getByRole('list', { name: 'Settings categories' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Appearance' })).toBeNull()

    const search = screen.getByRole('combobox', { name: 'Search settings' })
    await user.type(search, 'theme')
    await user.keyboard('{Escape}')

    expect(search).toHaveProperty('value', '')
    expect(settingsSheet?.getAttribute('data-page')).toBe('settings')
    expect(settingsSheet?.getAttribute('data-detent')).toBe('full')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    expect(settingsSheet?.getAttribute('data-detent')).toBe('full')
    expect(settingsSheet?.querySelector('.mobile-sheet-handle-row')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(screen.getByRole('list', { name: 'Settings categories' })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(settingsSheet?.getAttribute('data-page')).toBe('menu')
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
  })
  it('applies and remembers a chosen theme after remount', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    const firstRender = render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('navus:theme-preference:v1')).toBe('dark')

    firstRender.unmount()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('lets an open settings dropdown handle Escape before More navigates back', async () => {
    mockDesktopViewport()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    const paletteSelector = screen.getByRole('button', { name: /Other themes Choose/ })
    await user.click(paletteSelector)
    expect(screen.getByRole('listbox', { name: 'Other themes' })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: 'Other themes' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Other themes Choose/ })).toBeTruthy()
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

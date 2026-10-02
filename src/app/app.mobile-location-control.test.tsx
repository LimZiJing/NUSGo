// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const locateUser = vi.fn()
  return {
    state: null as unknown,
    onMapCenterChange: null as ((center: readonly [number, number]) => void) | null,
    session: {
      locateUser: vi.fn(),
      enableLocationTracking: vi.fn(),
    },
    commandLocateUser: locateUser,
    commands: new Proxy({ locateUser }, {
      get: (target, property) => target[property as keyof typeof target] ?? noop,
    }),
  }
})

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: (
    _container: HTMLElement,
    dependencies: { onMapCenterChange?: (center: readonly [number, number]) => void },
  ) => {
    appHarness.onMapCenterChange = dependencies.onMapCenterChange ?? null
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

beforeEach(() => {
  appHarness.state = createInitialNavigationSessionState()
})

afterEach(() => {
  cleanup()
  appHarness.onMapCenterChange = null
  localStorage.clear()
  appHarness.commandLocateUser.mockClear()
  appHarness.session.locateUser.mockClear()
  appHarness.session.enableLocationTracking.mockClear()
})

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

describe('mobile location control integration', () => {
  it('renders one mobile location action without a separate recenter action', () => {
    mockMobileViewport()

    render(<App />)

    expect(screen.getAllByRole('button', { name: 'Show my location' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Recenter map' })).toBeNull()
  })

  it('hides the combined control while Plan is expanded', async () => {
    const user = userEvent.setup()
    mockMobileViewport()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Plan' }))

    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
  })

  it('routes activation to the location command', async () => {
    const user = userEvent.setup()
    mockMobileViewport()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Show my location' }))

    expect(appHarness.commandLocateUser).toHaveBeenCalledOnce()
  })

  it('uses the locate command for the automatic Nearby location request', async () => {
    mockMobileViewport()

    render(<App />)

    await vi.waitFor(() => expect(appHarness.session.locateUser).toHaveBeenCalledOnce())
    expect(appHarness.session.enableLocationTracking).not.toHaveBeenCalled()
  })

  it('opens Nearby timings after a successful automatic location fix without opening Favourites', async () => {
    const user = userEvent.setup()
    mockMobileViewport()
    localStorage.setItem('navus:favorite-stops:v1', JSON.stringify(['STOP-A']))
    const initialState = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
    }
    appHarness.state = initialState

    const { rerender } = render(<App />)

    await vi.waitFor(() => expect(appHarness.session.locateUser).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' })).toBeTruthy()

    appHarness.state = {
      ...initialState,
      location: {
        status: 'tracking',
        latestFix: {
          longitude: 103,
          latitude: 1,
          accuracy: 10,
          timestamp: Date.now(),
        },
      },
    }
    rerender(<App />)

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Collapse Stop A bus timings' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Favourites' }))

    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' })).toBeTruthy()
  })

  it('opens stops that become Nearby after the location-driven recenter completes', async () => {
    mockMobileViewport()
    const network = createValidTransitNetwork()
    network.stops[1] = { ...network.stops[1], latitude: 1, longitude: 103.02 }
    const initialState = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(network),
    }
    appHarness.state = initialState

    const { rerender } = render(<App />)

    await vi.waitFor(() => expect(appHarness.session.locateUser).toHaveBeenCalledOnce())

    appHarness.state = {
      ...initialState,
      location: {
        status: 'tracking',
        latestFix: {
          longitude: 103.02,
          latitude: 1,
          accuracy: 10,
          timestamp: Date.now(),
        },
      },
    }
    rerender(<App />)
    await act(async () => {
      appHarness.onMapCenterChange?.([103.02, 1])
    })

    await vi.waitFor(() => expect(
      screen.getByRole('button', { name: 'Collapse Stop B bus timings' }),
    ).toBeTruthy())
  })

  it('opens Nearby timings when the location button succeeds with an active fix', async () => {
    const user = userEvent.setup()
    mockMobileViewport()
    appHarness.state = {
      ...createInitialNavigationSessionState({
        status: 'tracking',
        latestFix: {
          longitude: 103,
          latitude: 1,
          accuracy: 10,
          timestamp: Date.now(),
        },
      }),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
    }

    render(<App />)

    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show my location' }))

    expect(screen.getByRole('button', { name: 'Collapse Stop A bus timings' })).toBeTruthy()
    expect(appHarness.commandLocateUser).toHaveBeenCalledOnce()
  })

  it('keeps Nearby timings closed when the automatic location request fails', async () => {
    mockMobileViewport()
    const initialState = {
      ...createInitialNavigationSessionState(),
      transitIndex: createTransitIndex(createValidTransitNetwork()),
    }
    appHarness.state = initialState

    const { rerender } = render(<App />)

    await vi.waitFor(() => expect(appHarness.session.locateUser).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' })).toBeTruthy()

    appHarness.state = {
      ...initialState,
      location: { status: 'denied', latestFix: null },
    }
    rerender(<App />)

    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' })).toBeTruthy()
  })

  it('groups desktop map controls into one layout stack', () => {
    mockDesktopViewport()

    render(<App />)

    const stack = document.querySelector('.map-control-stack')
    expect(stack?.querySelector('.theme-toggle')).toBeTruthy()
    expect(stack?.querySelector('.location-control')).toBeTruthy()
    expect(stack?.querySelector('.map-legend')).toBeTruthy()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  const locateUser = vi.fn()
  return {
    state: null as unknown,
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
  createNavigationSessionMount: () => ({
    session: appHarness.session,
    dispose: () => undefined,
  }),
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

  it('groups desktop map controls into one layout stack', () => {
    mockDesktopViewport()

    render(<App />)

    const stack = document.querySelector('.map-control-stack')
    expect(stack?.querySelector('.theme-toggle')).toBeTruthy()
    expect(stack?.querySelector('.location-control')).toBeTruthy()
    expect(stack?.querySelector('.map-legend')).toBeTruthy()
  })
})

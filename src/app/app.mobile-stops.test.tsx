// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import App from './app'
import { createInitialNavigationSessionState } from './navigation-session'

const appHarness = vi.hoisted(() => {
  const noop = () => undefined
  return {
    state: null as unknown,
    commands: new Proxy<Record<string, () => undefined>>({}, { get: () => noop }),
    arrivalsClient: {
      getArrivals: vi.fn(),
    },
  }
})

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: () => ({ session: null, dispose: () => undefined }),
  createNavigationSessionCommandAdapter: () => () => appHarness.commands,
}))

vi.mock('./use-navigation-session', () => ({
  useNavigationSession: () => appHarness.state,
}))

vi.mock('../infrastructure/shuttle-arrivals/client', () => ({
  createShuttleArrivalClient: () => appHarness.arrivalsClient,
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
})

describe('mobile Stops tab state', () => {
  it('renders live internal-shuttle arrivals for visible Stops cards', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    await waitFor(() => expect(screen.getByText('5m')).toBeTruthy())

    expect(screen.getByText('LIVE')).toBeTruthy()
    expect(appHarness.arrivalsClient.getArrivals).toHaveBeenCalledWith(
      [{ stopId: 'STOP-A', stopName: 'Stop A' }],
      expect.any(AbortSignal),
    )
  })

  it('returns from Plan to Favourites with the selected stop card still collapsed', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Favourites' }))
    const stopCard = screen.getByRole('button', { name: 'Collapse Stop A bus timings' })
    await user.click(stopCard)

    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' }).getAttribute('aria-expanded'))
      .toBe('false')

    await user.click(screen.getByRole('button', { name: 'Plan' }))
    await user.click(screen.getByRole('button', { name: 'Stops' }))

    expect(screen.getByRole('button', { name: 'Favourites' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Expand Stop A bus timings' }).getAttribute('aria-expanded'))
      .toBe('false')
  })
})

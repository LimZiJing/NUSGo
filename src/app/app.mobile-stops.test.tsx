// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
  }
})

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: () => ({ session: null, dispose: () => undefined }),
  createNavigationSessionCommandAdapter: () => () => appHarness.commands,
}))

vi.mock('./use-navigation-session', () => ({
  useNavigationSession: () => appHarness.state,
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
  localStorage.setItem(FAVORITE_STOPS_KEY, JSON.stringify(['STOP-A']))
  appHarness.state = {
    ...createInitialNavigationSessionState(),
    transitIndex: createTransitIndex(createValidTransitNetwork()),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('mobile Stops tab state', () => {
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

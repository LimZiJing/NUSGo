// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './app'

const { locateUser } = vi.hoisted(() => ({ locateUser: vi.fn() }))

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: () => ({
    session: null,
    dispose: () => undefined,
  }),
  createNavigationSessionCommandAdapter: () => () => new Proxy({ locateUser }, {
    get: (target, property) => target[property as keyof typeof target] ?? (() => undefined),
  }),
}))

afterEach(() => {
  cleanup()
  locateUser.mockClear()
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

    expect(locateUser).toHaveBeenCalledOnce()
  })
})

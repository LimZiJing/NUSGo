// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './app'

vi.mock('./navigation-session-mount', () => ({
  createNavigationSessionMount: () => ({
    session: null,
    dispose: () => undefined,
  }),
  createNavigationSessionCommandAdapter: () => () => new Proxy({}, {
    get: () => () => undefined,
  }),
}))

afterEach(cleanup)

describe('mobile location control integration', () => {
  it('renders one target action at the recenter control position', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })

    render(<App />)

    expect(screen.getAllByRole('button', { name: 'Show my location' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Recenter map' })).toBeNull()
    expect(document.querySelectorAll('.map-recenter-control')).toHaveLength(0)
  })

  it('hides the combined control while Plan is expanded', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Plan' }))

    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveBusToggle } from './live-bus-toggle'

afterEach(cleanup)

describe('LiveBusToggle', () => {
  it.each([
    [false, true],
    [true, false],
  ])('reports its pressed state and toggles from %s', async (enabled, nextEnabled) => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<LiveBusToggle enabled={enabled} onToggle={onToggle} />)

    const toggle = screen.getByRole('button', { name: 'Live buses' })
    expect(toggle.getAttribute('aria-pressed')).toBe(String(enabled))
    await user.click(toggle)
    expect(onToggle).toHaveBeenCalledWith(nextEnabled)
  })
})

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
    expect(toggle.getAttribute('title')).toBe(enabled ? 'Hide live buses' : 'Show live buses')
    expect(toggle.getAttribute('data-size')).toBe('lg')
    expect(toggle.getAttribute('data-variant')).toBe('secondary')
    await user.click(toggle)
    expect(onToggle).toHaveBeenCalledWith(nextEnabled)
  })
})

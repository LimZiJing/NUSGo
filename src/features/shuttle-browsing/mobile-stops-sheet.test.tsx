// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileStopsSheet } from './mobile-stops-sheet'

afterEach(cleanup)

describe('MobileStopsSheet', () => {
  it('offers an explicit control to expand the map-based Stops sheet', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const { rerender } = render(
      <MobileStopsSheet expanded={false} onExpandedChange={onExpandedChange} />,
    )

    const toggle = screen.getByRole('button', { name: 'Show stops panel' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    rerender(<MobileStopsSheet expanded onExpandedChange={onExpandedChange} />)
    expect(screen.getByRole('button', { name: 'Hide stops panel' }).getAttribute('aria-expanded'))
      .toBe('true')
    expect(screen.getByText('Tap a shuttle stop on the map to view its details and route actions.'))
      .toBeTruthy()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoreEntryButton } from './more-entry-button'

afterEach(cleanup)

describe('MoreEntryButton', () => {
  it.each([false, true])('exposes the panel state when expanded is %s', (expanded) => {
    render(<MoreEntryButton expanded={expanded} onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'More' })
    expect(button.getAttribute('title')).toBe('More')
    expect(button.getAttribute('aria-expanded')).toBe(String(expanded))
    expect(button.getAttribute('aria-controls')).toBe('more-panel')
    expect(button.getAttribute('data-size')).toBe('lg')
    expect(button.getAttribute('data-variant')).toBe('secondary')
  })

  it('activates the existing panel action', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<MoreEntryButton expanded={false} onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})

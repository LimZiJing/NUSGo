// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationControl } from './location-control'

afterEach(cleanup)

describe('LocationControl', () => {
  it('provides one direct locate action with an accessible target label', async () => {
    const user = userEvent.setup()
    const onLocate = vi.fn()
    render(<LocationControl topOffset={76} onLocate={onLocate} />)

    const button = screen.getByRole('button', { name: 'Show my location' })
    expect(button.getAttribute('title')).toBe('Show my location')
    expect(screen.queryByRole('group', { name: 'Location controls' })).toBeNull()

    await user.click(button)
    expect(onLocate).toHaveBeenCalledOnce()
  })
})

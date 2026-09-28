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
    render(<LocationControl topOffset={76} searching={false} onLocate={onLocate} />)

    const button = screen.getByRole('button', { name: 'Show my location' })
    expect(button.getAttribute('title')).toBe('Show my location')
    expect(screen.queryByRole('group', { name: 'Location controls' })).toBeNull()

    await user.click(button)
    expect(onLocate).toHaveBeenCalledOnce()
  })

  it('activates the locate action with the keyboard', async () => {
    const user = userEvent.setup()
    const onLocate = vi.fn()
    render(<LocationControl topOffset={76} searching={false} onLocate={onLocate} />)

    screen.getByRole('button', { name: 'Show my location' }).focus()
    await user.keyboard('{Enter}')

    expect(onLocate).toHaveBeenCalledOnce()
  })

  it('shows a quiet searching state while waiting for the first fix', () => {
    render(<LocationControl topOffset={76} searching onLocate={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Finding your location' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('title')).toBe('Finding your location')
    expect(screen.getByRole('status').textContent).toBe('Finding your location')
    expect(button.querySelector('.location-control-spinner')).toBeTruthy()
  })

  it('is absent while the mobile Plan sheet is expanded', () => {
    render(<LocationControl visible={false} topOffset={76} searching={false} onLocate={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Show my location' })).toBeNull()
  })
})

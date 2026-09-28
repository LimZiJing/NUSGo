// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapRecenterControl } from './map-recenter-control'

afterEach(cleanup)

describe('MapRecenterControl', () => {
  it('exposes a named button and recenters when activated by pointer', async () => {
    const user = userEvent.setup()
    const onRecenter = vi.fn()
    render(<MapRecenterControl visible onRecenter={onRecenter} />)

    const button = screen.getByRole('button', { name: 'Recenter map' })
    expect(button.getAttribute('type')).toBe('button')
    await user.click(button)

    expect(onRecenter).toHaveBeenCalledOnce()
  })

  it('recenters when activated with the keyboard', async () => {
    const user = userEvent.setup()
    const onRecenter = vi.fn()
    render(<MapRecenterControl visible onRecenter={onRecenter} />)

    const button = screen.getByRole('button', { name: 'Recenter map' })
    button.focus()
    await user.keyboard('{Enter}')

    expect(onRecenter).toHaveBeenCalledOnce()
  })

  it('is absent when the mobile Plan sheet hides it', () => {
    render(<MapRecenterControl visible={false} onRecenter={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Recenter map' })).toBeNull()
  })
})

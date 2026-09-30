// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './theme-toggle'

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  it('offers the other theme', () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(button.textContent).toBe('Dark')
    expect(button.getAttribute('title')).toBe('Switch to dark theme')
  })

  it('toggles with a click and keyboard activation', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ThemeToggle theme="dark" onToggle={onToggle} />)

    const button = screen.getByRole('button', { name: 'Switch to light theme' })
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')

    expect(onToggle).toHaveBeenCalledTimes(2)
  })
})

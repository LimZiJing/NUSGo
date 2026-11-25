// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackButton } from './back-button'

afterEach(cleanup)

describe('BackButton', () => {
  it('uses the shared icon control in headers', () => {
    render(<BackButton mode="header" label="Back to previous view" title="Back" onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Back to previous view' })
    expect(button.className).toBe('button icon-button')
    expect(button.getAttribute('data-variant')).toBe('secondary')
    expect(button.getAttribute('title')).toBe('Back')
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('keeps the compact arrow and label for inline navigation', () => {
    render(<BackButton mode="inline" label="Back to stops" onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Back to stops' })
    expect(button.getAttribute('data-back-button-mode')).toBe('inline')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('preserves a label-only back action', () => {
    render(<BackButton mode="label-only" label="Back to categories" onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Back to categories' })
    expect(button.getAttribute('data-variant')).toBe('ghost')
    expect(button.hasAttribute('data-back-button-mode')).toBe(false)
    expect(button.querySelector('svg')).toBeNull()
  })
})

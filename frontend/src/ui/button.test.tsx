// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from './button'
import { MenuItem } from './menu-item'

afterEach(cleanup)

describe('Button', () => {
  it('is always a non-submitting button', () => {
    render(<Button label="Save" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })

  it('defaults to a small secondary button and exposes variant and size', () => {
    const { rerender } = render(<Button label="Save" onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.getAttribute('data-variant')).toBe('secondary')
    expect(button.getAttribute('data-size')).toBe('sm')

    rerender(<Button label="Save" variant="primary" size="lg" onClick={vi.fn()} />)
    expect(button.getAttribute('data-variant')).toBe('primary')
    expect(button.getAttribute('data-size')).toBe('lg')
  })

  it('renders a leading icon before the label', () => {
    render(<Button label="Save" icon={<svg data-testid="icon" />} onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.firstElementChild?.getAttribute('data-testid')).toBe('icon')
  })

  it('reports disabled and pressed state through attributes', () => {
    render(<Button label="Save" pressed disabled onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Save' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('leaves aria-pressed off a button that is not a toggle', () => {
    render(<Button label="Save" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('aria-pressed')).toBe(false)
  })

  it('does not call onClick while disabled and calls it once when enabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<Button label="Save" disabled onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).not.toHaveBeenCalled()

    rerender(<Button label="Save" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('lets className add layout classes without changing the look attributes', () => {
    render(<Button label="Save" variant="ghost" className="layout-hook" onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.className).toBe('button layout-hook')
    expect(button.getAttribute('data-variant')).toBe('ghost')
    expect(button.hasAttribute('style')).toBe(false)
  })
})

describe('Button trailing icon', () => {
  it('renders the trailing icon after the label', () => {
    render(<Button label="Opposite stop" trailingIcon={<svg data-testid="trail" />} onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Opposite stop' })
    expect(button.lastElementChild?.getAttribute('data-testid')).toBe('trail')
  })
})

describe('IconButton', () => {
  it('supports a plain variant for icon toggles', () => {
    render(<IconButton label="Favourite" icon={<svg />} variant="plain" pressed onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Favourite' })
    expect(button.getAttribute('data-variant')).toBe('plain')
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('names the button from its required label', () => {
    render(<IconButton label="Clear search" icon={<svg />} onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Clear search' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-label')).toBe('Clear search')
    expect(button.textContent).toBe('')
  })

  it('requires a label at compile time', () => {
    // @ts-expect-error An icon-only button without a label has no accessible name.
    const missingLabel = <IconButton icon={<svg />} onClick={vi.fn()} />

    expect(missingLabel).toBeTruthy()
  })

  it('supports size, disabled and pressed states', () => {
    render(<IconButton label="Pin" icon={<svg />} size="lg" pressed disabled onClick={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Pin' })
    expect(button.getAttribute('data-size')).toBe('lg')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.className).toBe('button icon-button')
  })
})

describe('MenuItem', () => {
  it('is a full-row button with its label and optional icon', () => {
    render(<MenuItem label="Clear all" icon={<svg data-testid="icon" />} onClick={vi.fn()} />)

    const item = screen.getByRole('button', { name: 'Clear all' })
    expect(item.getAttribute('type')).toBe('button')
    expect(item.className).toBe('menu-item')
    expect(item.firstElementChild?.getAttribute('data-testid')).toBe('icon')
  })

  it('supports disabled and layout-only className', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<MenuItem label="Clear all" disabled className="layout-hook" onClick={onClick} />)

    const item = screen.getByRole('button', { name: 'Clear all' })
    expect((item as HTMLButtonElement).disabled).toBe(true)
    expect(item.className).toBe('menu-item layout-hook')
    await user.click(item)
    expect(onClick).not.toHaveBeenCalled()
  })
})

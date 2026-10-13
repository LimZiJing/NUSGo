// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chip } from './chip'

afterEach(cleanup)

describe('Chip', () => {
  it('is a non-submitting button with its label', () => {
    render(<Chip label="Pending" onClick={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'Pending' })
    expect(chip.getAttribute('type')).toBe('button')
    expect(chip.getAttribute('data-size')).toBe('sm')
  })

  it('announces a toggle through aria-pressed and marks it selected', () => {
    const { rerender } = render(<Chip label="Pending" pressed={false} onClick={vi.fn()} />)
    const chip = screen.getByRole('button', { name: 'Pending' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(chip.hasAttribute('data-selected')).toBe(false)

    rerender(<Chip label="Pending" pressed onClick={vi.fn()} />)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.getAttribute('data-selected')).toBe('true')
  })

  it('leaves aria-pressed off a chip that is not a toggle', () => {
    render(<Chip label="Pending" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Pending' }).hasAttribute('aria-pressed')).toBe(false)
  })

  it('passes a tone to the selected appearance as custom properties', () => {
    render(<Chip label="A1" pressed tone={{ fill: '#fb0101', text: '#ffffff' }} onClick={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'A1' })
    expect(chip.style.getPropertyValue('--chip-tone')).toBe('#fb0101')
    expect(chip.style.getPropertyValue('--chip-tone-text')).toBe('#ffffff')
  })

  it('supports disabled and does not call onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Chip label="Pending" disabled onClick={onClick} />)

    const chip = screen.getByRole('button', { name: 'Pending' })
    expect((chip as HTMLButtonElement).disabled).toBe(true)
    await user.click(chip)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('lets className add layout classes without changing the look attributes', () => {
    render(<Chip label="Pending" size="lg" className="layout-hook" onClick={vi.fn()} />)

    const chip = screen.getByRole('button', { name: 'Pending' })
    expect(chip.className).toBe('chip layout-hook')
    expect(chip.getAttribute('data-size')).toBe('lg')
    expect(chip.hasAttribute('style')).toBe(false)
  })
})

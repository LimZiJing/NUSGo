// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Gallery, GalleryPanel } from './gallery'

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
  window.history.replaceState(null, '', '/')
})

describe('controls gallery', () => {
  it('shows every Button variant, size and state', () => {
    render(<GalleryPanel theme="light" />)

    const section = screen.getByRole('region', { name: 'Button' })
    const buttons = within(section).getAllByRole('button')
    expect(buttons).toHaveLength(3 * 2 * 6)
    expect(within(section).getAllByRole('button', { pressed: true })).toHaveLength(3 * 2)
    expect(buttons.filter((button) => (button as HTMLButtonElement).disabled)).toHaveLength(3 * 2)
    expect(new Set(buttons.map((button) => button.getAttribute('data-variant')))).toEqual(
      new Set(['primary', 'secondary', 'ghost']),
    )
  })

  it('shows IconButton, MenuItem, Chip and Pill samples', () => {
    render(<GalleryPanel theme="dark" />)

    expect(within(screen.getByRole('region', { name: 'IconButton' })).getAllByRole('button', { name: 'Search' }))
      .toHaveLength(3 * 2 * 6)
    expect(within(screen.getByRole('region', { name: 'MenuItem' })).getAllByRole('button')).toHaveLength(6)
    expect(within(screen.getByRole('region', { name: 'Chip' })).getAllByRole('button')).toHaveLength(4 * 6)
    const pills = screen.getByRole('region', { name: 'Pill' })
    expect(within(pills).getByText('Neutral').getAttribute('data-tone')).toBe('neutral')
    expect(within(pills).getByText('Success').getAttribute('data-tone')).toBe('success')
  })

  it('applies the panel theme through the existing data-theme mechanism', () => {
    render(<GalleryPanel theme="dark" />)

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('renders a frame for each of the four themes on the gallery page', () => {
    const { container } = render(<Gallery />)

    expect(Array.from(container.querySelectorAll('iframe')).map((frame) => frame.getAttribute('src'))).toEqual([
      expect.stringContaining('frame=light'),
      expect.stringContaining('frame=dark'),
      expect.stringContaining('frame=matcha'),
      expect.stringContaining('frame=sakura'),
    ])
  })

  it.each(['matcha', 'sakura'] as const)('applies the %s theme through data-theme', (theme) => {
    render(<GalleryPanel theme={theme} />)

    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(screen.getByRole('main', { name: `${theme} theme controls` })).toBeTruthy()
  })

  it('renders a single themed panel when a frame is requested', () => {
    window.history.replaceState(null, '', '/?gallery&frame=dark')
    render(<Gallery />)

    expect(screen.getByRole('main', { name: 'dark theme controls' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GALLERY_THEMES } from '../themes/catalog'
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

  it('shows BackButton, IconButton, MenuItem, Chip and Pill samples', () => {
    render(<GalleryPanel theme="dark" />)

    expect(
      within(screen.getByRole('region', { name: 'Open Button' }))
        .getByRole('button', { name: 'Show options' })
        .getAttribute('aria-expanded'),
    ).toBe('true')

    const backButtons = within(screen.getByRole('region', { name: 'BackButton' }))
    expect(backButtons.getByRole('button', { name: 'Back to previous view' }).querySelector('svg')).not.toBeNull()
    expect(backButtons.getByRole('button', { name: 'Back to stops' }).querySelector('svg')).not.toBeNull()
    expect(backButtons.getByRole('button', { name: 'Back to categories' }).querySelector('svg')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'IconButton' })).getAllByRole('button', { name: 'Search' }))
      .toHaveLength(4 * 2 * 6)
    expect(within(screen.getByRole('region', { name: 'MenuItem' })).getAllByRole('button')).toHaveLength(6)
    expect(within(screen.getByRole('region', { name: 'Chip' })).getAllByRole('button')).toHaveLength(4 * 6)
    const pills = screen.getByRole('region', { name: 'Pill' })
    expect(within(pills).getByText('Neutral').getAttribute('data-tone')).toBe('neutral')
    expect(within(pills).getByText('Success').getAttribute('data-tone')).toBe('success')
    expect(within(screen.getByRole('region', { name: 'Select' })).getByRole('button').getAttribute('aria-haspopup'))
      .toBe('listbox')
  })

  it('applies the panel theme through the existing data-theme mechanism', () => {
    render(<GalleryPanel theme="dark" />)

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('renders a frame for each theme on the gallery page', () => {
    const { container } = render(<Gallery />)

    expect(Array.from(container.querySelectorAll('iframe')).map((frame) => frame.getAttribute('src')))
      .toEqual(GALLERY_THEMES.map(({ id }) => expect.stringContaining(`frame=${id}`)))
  })

  it.each(GALLERY_THEMES.filter(({ category }) => category === 'other'))(
    'applies the $label theme through data-theme',
    ({ id }) => {
      render(<GalleryPanel theme={id} />)

      expect(document.documentElement.dataset.theme).toBe(id)
      expect(screen.getByRole('main', { name: `${id} theme controls` })).toBeTruthy()
    },
  )

  it('renders a single themed panel when a frame is requested', () => {
    window.history.replaceState(null, '', '/?gallery&frame=dark')
    render(<Gallery />)

    expect(screen.getByRole('main', { name: 'dark theme controls' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

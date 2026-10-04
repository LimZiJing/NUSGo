// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainNavigation } from './main-navigation'

afterEach(cleanup)

describe('MainNavigation', () => {
  it('exposes exactly one current view for assistive technology', () => {
    const views = [
      { id: 'explore', label: 'Explore' },
      { id: 'stops', label: 'Stops' },
      { id: 'plan', label: 'Plan' },
    ] as const
    const view = render(<MainNavigation activeView="explore" onSelectView={vi.fn()} />)

    for (const activeView of views) {
      view.rerender(<MainNavigation activeView={activeView.id} onSelectView={vi.fn()} />)

      for (const navigationView of views) {
        const current = screen.getByRole('button', { name: navigationView.label })
        expect(current.getAttribute('aria-current')).toBe(
          navigationView.id === activeView.id ? 'page' : null,
        )
      }
    }
  })

  it('keeps each view label accessible and hides its decorative icon', () => {
    const { container } = render(<MainNavigation activeView="stops" onSelectView={vi.fn()} />)

    for (const label of ['Explore', 'Stops', 'Plan']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }

    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons).toHaveLength(3)
    for (const icon of icons) {
      expect(icon.getAttribute('focusable')).toBe('false')
    }
  })

  it('exposes the active view and lets the user select another view', async () => {
    const user = userEvent.setup()
    const onSelectView = vi.fn()
    render(<MainNavigation activeView="explore" onSelectView={onSelectView} />)

    const navigation = screen.getByRole('navigation', { name: 'Map views' })
    const explore = screen.getByRole('button', { name: 'Explore' })
    const stops = screen.getByRole('button', { name: 'Stops' })

    expect(navigation).toBeTruthy()
    expect(navigation.hasAttribute('aria-hidden')).toBe(false)
    expect(navigation.hasAttribute('inert')).toBe(false)
    expect(explore.getAttribute('aria-current')).toBe('page')
    expect(explore.getAttribute('aria-controls')).toBe('explore-panel')
    expect(stops.getAttribute('aria-current')).toBeNull()
    await user.click(stops)

    expect(onSelectView).toHaveBeenCalledWith('stops')
    expect(stops).toBe(document.activeElement)
  })

  it('keeps view buttons keyboard focusable and activates them with Enter', async () => {
    const user = userEvent.setup()
    const onSelectView = vi.fn()
    render(<MainNavigation activeView="explore" onSelectView={onSelectView} />)

    const explore = screen.getByRole('button', { name: 'Explore' })
    const stops = screen.getByRole('button', { name: 'Stops' })
    await user.tab()
    expect(explore).toBe(document.activeElement)
    await user.tab()
    expect(stops).toBe(document.activeElement)
    await user.keyboard('{Enter}')

    expect(onSelectView).toHaveBeenCalledWith('stops')
  })
})

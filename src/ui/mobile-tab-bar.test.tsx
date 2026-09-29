// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileTabBar } from './mobile-tab-bar'

afterEach(cleanup)

describe('MobileTabBar', () => {
  it('exposes exactly one current map view for assistive technology', () => {
    const tabs = [
      { id: 'explore', label: 'Explore' },
      { id: 'stops', label: 'Stops' },
      { id: 'plan', label: 'Plan' },
    ] as const
    const view = render(<MobileTabBar activeTab="explore" onSelectTab={vi.fn()} />)

    for (const activeTab of tabs) {
      view.rerender(<MobileTabBar activeTab={activeTab.id} onSelectTab={vi.fn()} />)

      for (const tab of tabs) {
        const current = screen.getByRole('button', { name: tab.label })
        expect(current.getAttribute('aria-current')).toBe(
          tab.id === activeTab.id ? 'page' : null,
        )
      }
    }
  })

  it('keeps each map view label accessible and hides its decorative icon', () => {
    const { container } = render(<MobileTabBar activeTab="stops" onSelectTab={vi.fn()} />)

    for (const label of ['Explore', 'Stops', 'Plan']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }

    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons).toHaveLength(3)
    for (const icon of icons) {
      expect(icon.getAttribute('focusable')).toBe('false')
    }
  })

  it('exposes the active map view and lets the user select another tab', async () => {
    const user = userEvent.setup()
    const onSelectTab = vi.fn()
    render(<MobileTabBar activeTab="explore" onSelectTab={onSelectTab} />)

    const navigation = screen.getByRole('navigation', { name: 'Map views' })
    const explore = screen.getByRole('button', { name: 'Explore' })
    const stops = screen.getByRole('button', { name: 'Stops' })

    expect(navigation).toBeTruthy()
    expect(explore.getAttribute('aria-current')).toBe('page')
    expect(explore.getAttribute('aria-controls')).toBe('mobile-explore-panel')
    expect(stops.getAttribute('aria-current')).toBeNull()
    await user.click(stops)

    expect(onSelectTab).toHaveBeenCalledWith('stops')
    expect(stops).toBe(document.activeElement)
  })

  it('keeps tab buttons keyboard focusable and activates them with Enter', async () => {
    const user = userEvent.setup()
    const onSelectTab = vi.fn()
    render(<MobileTabBar activeTab="explore" onSelectTab={onSelectTab} />)

    const explore = screen.getByRole('button', { name: 'Explore' })
    const stops = screen.getByRole('button', { name: 'Stops' })
    await user.tab()
    expect(explore).toBe(document.activeElement)
    await user.tab()
    expect(stops).toBe(document.activeElement)
    await user.keyboard('{Enter}')

    expect(onSelectTab).toHaveBeenCalledWith('stops')
  })
})

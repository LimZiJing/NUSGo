// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileTabBar } from './mobile-tab-bar'

afterEach(cleanup)

describe('MobileTabBar', () => {
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
})

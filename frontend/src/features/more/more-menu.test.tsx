// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoreMenu } from './more-menu'

afterEach(cleanup)

describe('MoreMenu', () => {
  it('shows the current waypoint count and routes each destination', async () => {
    const user = userEvent.setup()
    const onOpenWaypoints = vi.fn()
    const onSuggestPlace = vi.fn()
    const onOpenSettings = vi.fn()
    const onOpenReleaseNotes = vi.fn()
    render(
      <MoreMenu
        waypointCount={12}
        onOpenWaypoints={onOpenWaypoints}
        onSuggestPlace={onSuggestPlace}
        onOpenSettings={onOpenSettings}
        onOpenReleaseNotes={onOpenReleaseNotes}
      />,
    )

    expect(screen.getByText('12 saved places')).toBeTruthy()
    expect(screen.getByText('Appearance, favourites and waypoints')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Suggest a place' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Release notes' }))
    expect(onOpenWaypoints).toHaveBeenCalledOnce()
    expect(onSuggestPlace).toHaveBeenCalledOnce()
    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(onOpenReleaseNotes).toHaveBeenCalledOnce()
  })
})

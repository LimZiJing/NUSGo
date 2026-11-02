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
    const onOpenSettings = vi.fn()
    render(
      <MoreMenu
        waypointCount={12}
        onOpenWaypoints={onOpenWaypoints}
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(screen.getByText('12 saved places')).toBeTruthy()
    expect(screen.getByText('Appearance and favourites')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'My waypoints' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenWaypoints).toHaveBeenCalledOnce()
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})

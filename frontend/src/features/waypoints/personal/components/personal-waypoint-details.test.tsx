// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { PersonalWaypointDetails } from './personal-waypoint-details'

const waypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  note: 'Near the garden',
  markerColor: 'blue',
  markerIcon: 'dot',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

afterEach(cleanup)

describe('PersonalWaypointDetails', () => {
  it('shows waypoint details with directions as its only visible action', async () => {
    const user = userEvent.setup()
    const onDirections = vi.fn()
    render(<PersonalWaypointDetails
      waypoint={waypoint}
      canManage
      onDirections={onDirections}
      onEdit={() => undefined}
      onDelete={() => undefined}
    />)

    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(screen.getByText('Rest spot')).toBeTruthy()
    expect(screen.getByText('Near the garden')).toBeTruthy()
    expect(screen.getByText('1.290000, 103.780000').className)
      .toContain('personal-waypoint-details-coordinate')

    // Exactly one action is visible: Directions. Edit and Delete live behind the overflow menu.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    const directions = screen.getByRole('button', { name: 'Directions' })
    const menuTrigger = screen.getByRole('button', { name: 'Waypoint actions' })
    expect(buttons).toEqual([menuTrigger, directions])
    expect(directions.getAttribute('data-variant')).toBe('primary')
    expect(screen.queryByRole('button', { name: 'Edit waypoint' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete waypoint' })).toBeNull()

    await user.click(directions)
    expect(onDirections).toHaveBeenCalledOnce()
  })

  it('keeps the waypoint edit and delete commands in the one overflow menu', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PersonalWaypointDetails
      waypoint={waypoint}
      canManage
      onDirections={() => undefined}
      onEdit={onEdit}
      onDelete={onDelete}
    />)

    // A details screen is allowed exactly one overflow menu trigger.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Waypoint actions' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
    const menu = screen.getByRole('group', { name: 'Waypoint actions' })
    expect(within(menu).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['Edit waypoint', 'Delete waypoint'])

    await user.click(within(menu).getByRole('button', { name: 'Edit waypoint' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Waypoint actions' }))
    const reopened = screen.getByRole('group', { name: 'Waypoint actions' })
    await user.click(within(reopened).getByRole('button', { name: 'Delete waypoint' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('explains when the selected waypoint is no longer available', () => {
    render(<PersonalWaypointDetails
      waypoint={null}
      canManage={false}
      onDirections={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
    />)

    expect(screen.getByRole('status').textContent).toContain('no longer available')
  })
})

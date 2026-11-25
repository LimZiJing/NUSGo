// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PersonalWaypointDetails', () => {
  it('shows waypoint details and offers Directions before quiet edit and delete actions', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const onDirections = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PersonalWaypointDetails
      waypoint={waypoint}
      canManage
      onDirections={onDirections}
      onEdit={onEdit}
      onDelete={onDelete}
    />)

    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(screen.getByText('Rest spot')).toBeTruthy()
    expect(screen.getByText('Near the garden')).toBeTruthy()
    expect(screen.getByText('1.290000, 103.780000').className)
      .toContain('personal-waypoint-details-coordinate')

    const directions = screen.getByRole('button', { name: 'Directions' })
    const edit = screen.getByRole('button', { name: 'Edit waypoint' })
    const remove = screen.getByRole('button', { name: 'Delete waypoint' })
    expect(directions.getAttribute('data-variant')).toBe('primary')
    expect(edit.getAttribute('data-variant')).toBe('ghost')
    expect(remove.getAttribute('data-variant')).toBe('ghost')
    expect(remove.className).toContain('personal-waypoint-details-delete')
    expect(screen.getAllByRole('button')).toEqual([directions, edit, remove])

    await user.click(directions)
    expect(onDirections).toHaveBeenCalledOnce()

    await user.click(edit)
    expect(onEdit).toHaveBeenCalledOnce()

    await user.click(remove)
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('names the waypoint in the delete prompt and keeps it when cancelled', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    render(<PersonalWaypointDetails
      waypoint={waypoint}
      canManage
      onDirections={() => undefined}
      onEdit={() => undefined}
      onDelete={onDelete}
    />)

    const remove = screen.getByRole('button', { name: 'Delete waypoint' })
    remove.focus()
    await user.click(remove)

    expect(confirm).toHaveBeenCalledWith('Delete "Quiet bench"? This cannot be undone.')
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(document.activeElement).toBe(remove)
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

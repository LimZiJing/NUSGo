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
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

afterEach(cleanup)

describe('PersonalWaypointDetails', () => {
  it('shows waypoint details and offers separate edit and delete actions', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PersonalWaypointDetails waypoint={waypoint} canManage onEdit={onEdit} onDelete={onDelete} />)

    expect(screen.getByRole('heading', { name: 'Quiet bench' })).toBeTruthy()
    expect(screen.getByText('Rest spot')).toBeTruthy()
    expect(screen.getByText('Near the garden')).toBeTruthy()
    expect(screen.getByText('1.290000, 103.780000')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Edit waypoint' }))
    expect(onEdit).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Delete waypoint' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('explains when the selected waypoint is no longer available', () => {
    render(<PersonalWaypointDetails waypoint={null} canManage={false} onEdit={() => undefined} onDelete={() => undefined} />)

    expect(screen.getByRole('status').textContent).toContain('no longer available')
  })
})

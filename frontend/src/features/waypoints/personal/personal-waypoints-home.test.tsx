// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import { PersonalWaypointsHome } from './personal-waypoints-home'

const waypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

const readyResult: PersonalWaypointStoreReadResult = {
  kind: 'ready',
  waypoints: [waypoint],
  revision: null,
  rejectedRecords: { count: 0, issues: [] },
}

function StatefulPersonalWaypointsHome() {
  const [readResult, setReadResult] = useState(readyResult)

  return (
    <PersonalWaypointsHome
      readResult={readResult}
      status={null}
      onAdd={() => undefined}
      editing
      onRemove={(waypointId) => setReadResult((current) => {
        if (current.kind !== 'ready') return current
        return {
          ...current,
          waypoints: current.waypoints.filter(({ id }) => id !== waypointId),
        }
      })}
      onMove={() => undefined}
      onClearAll={() => undefined}
    />
  )
}

afterEach(cleanup)

describe('PersonalWaypointsHome', () => {
  it('keeps browser-profile privacy visible and combines status announcements', async () => {
    const props = {
      readResult: readyResult,
      status: 'Waypoint order saved.',
      onAdd: () => undefined,
      onRemove: () => undefined,
      onMove: () => undefined,
      onClearAll: () => undefined,
    }
    const view = render(<PersonalWaypointsHome {...props} editing={false} />)

    expect(screen.getByText('Personal Waypoints are saved in this browser profile.')).toBeTruthy()

    view.rerender(<PersonalWaypointsHome {...props} editing />)
    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(1)
      expect(screen.getByRole('status').textContent).toContain('Waypoint order saved.')
      expect(screen.getByRole('status').textContent).toContain('Edit list mode')
    })
  })

  it('restores focus to the page empty state when the last waypoint is removed', async () => {
    const user = userEvent.setup()
    render(<StatefulPersonalWaypointsHome />)

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))

    const emptyState = screen.getByText('No saved waypoints yet. Add a waypoint to start your list.')
    expect(document.activeElement).toBe(emptyState)
    expect(screen.queryByRole('heading', { name: 'Saved places 0' })).toBeNull()
  })
})

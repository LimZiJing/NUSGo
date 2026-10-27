// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { PersonalWaypointList } from './personal-waypoint-list'

function createWaypoint(id: number, name: string, category: string): PersonalWaypoint {
  const suffix = String(id).padStart(12, '0')
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    name,
    category,
    coordinate: { longitude: 103.78, latitude: 1.29 },
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  }
}

const waypoints = [
  createWaypoint(1, 'Quiet bench', 'Rest spot'),
  createWaypoint(2, 'Design studio', 'Study place'),
  createWaypoint(3, 'Tea room', 'Rest spot'),
]

function StatefulPersonalWaypointList() {
  const [savedWaypoints, setSavedWaypoints] = useState(waypoints)

  return (
    <PersonalWaypointList
      waypoints={savedWaypoints}
      canEdit
      editing
      onRemove={(waypointId) => setSavedWaypoints((current) => (
        current.filter((waypoint) => waypoint.id !== waypointId)
      ))}
      onMove={(waypointId, neighborId) => setSavedWaypoints((current) => {
        const from = current.findIndex((waypoint) => waypoint.id === waypointId)
        const to = current.findIndex((waypoint) => waypoint.id === neighborId)
        if (from < 0 || to < 0) return current
        const next = [...current]
        const movedWaypoint = next[from]
        const neighborWaypoint = next[to]
        if (!movedWaypoint || !neighborWaypoint) return current
        next[from] = neighborWaypoint
        next[to] = movedWaypoint
        return next
      })}
      onClearAll={() => setSavedWaypoints([])}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PersonalWaypointList', () => {
  it('filters by search and the categories present in the saved records', async () => {
    const user = userEvent.setup()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Saved places 3' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: 'Search saved places' })
    await user.type(search, 'design')
    expect(screen.getByText('Design studio')).toBeTruthy()
    expect(screen.queryByText('Quiet bench')).toBeNull()

    await user.clear(search)
    await user.click(screen.getByRole('button', { name: /Category/ }))
    await user.click(screen.getByRole('option', { name: 'Rest spot' }))

    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Tea roomRest spot',
    ])
  })

  it('announces edit mode and exposes labelled reorder and remove controls', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onRemove = vi.fn()
    const onEditAnnouncement = vi.fn()
    const view = render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onRemove={onRemove}
        onMove={onMove}
        onClearAll={() => undefined}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    view.rerender(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={onRemove}
        onMove={onMove}
        onClearAll={() => undefined}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    expect(onEditAnnouncement).toHaveBeenCalledWith(
      'Edit list mode. Use the move controls to reorder waypoints, or remove a waypoint.',
    )
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot up' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(false)

    await user.click(screen.getByRole('button', { name: 'Move Tea room, Rest spot up' }))
    expect(onMove).toHaveBeenCalledWith(waypoints[2].id, waypoints[1].id)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(onRemove).toHaveBeenCalledWith(waypoints[1].id)
  })

  it('keeps clear-all separate and confirms it before clearing', async () => {
    const user = userEvent.setup()
    const onClearAll = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={onClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(confirm).toHaveBeenCalledWith(
      'Clear all personal waypoints, including places hidden by filters?',
    )
    expect(onClearAll).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })

  it('does not show a popup menu on waypoint rows outside edit mode', () => {
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
      />,
    )

    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull()
  })

  it('disables reordering and clearing while search or category filters are active', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onClearAll = vi.fn()
    const confirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
        onClearAll={onClearAll}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search saved places' }), 'design')
    expect(screen.getByRole('button', { name: 'Move Design studio, Study place up' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByRole('button', { name: 'Move Design studio, Study place down' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByRole('button', { name: 'Clear all' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Clear search and category filters to reorder or clear all saved places.'))
      .toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onClearAll).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('searchbox', { name: 'Search saved places' }))
    await user.click(screen.getByRole('button', { name: /Category/ }))
    await user.click(screen.getByRole('option', { name: 'Rest spot' }))
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByRole('button', { name: 'Clear all' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps focus on the moved row and restores it to the list heading after removal', async () => {
    const user = userEvent.setup()
    render(<StatefulPersonalWaypointList />)

    await user.click(screen.getByRole('button', { name: 'Move Design studio, Study place up' }))
    const moveDown = screen.getByRole('button', { name: 'Move Design studio, Study place down' })
    expect(screen.getByRole('button', { name: 'Move Design studio, Study place up' }).hasAttribute('disabled'))
      .toBe(true)
    expect(document.activeElement).toBe(moveDown)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Saved places 2' }))

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Saved places 1' }))
  })
})

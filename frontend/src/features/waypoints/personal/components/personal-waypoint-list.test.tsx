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
    markerColor: 'blue',
    markerIcon: 'dot',
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
      onMove={(waypointId, targetIndex) => setSavedWaypoints((current) => {
        const from = current.findIndex((waypoint) => waypoint.id === waypointId)
        if (from < 0 || targetIndex < 0 || targetIndex >= current.length) return current
        const next = [...current]
        const [movedWaypoint] = next.splice(from, 1)
        next.splice(targetIndex, 0, movedWaypoint)
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
  it('filters All places by the current search', async () => {
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

    expect(screen.getByRole('heading', { name: 'All places 3' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: 'Search saved places' })
    await user.type(search, 'design')
    expect(screen.getByText('Design studio')).toBeTruthy()
    expect(screen.queryByText('Quiet bench')).toBeNull()

    await user.clear(search)
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Design studioStudy place',
      'Tea roomRest spot',
    ])
  })

  it('shows only places from a fixed category and allows category reordering without a bulk clear action', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        category="Rest spot"
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
        onClearAll={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Rest spot 2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Category/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Tea roomRest spot',
    ])

    await user.click(screen.getByRole('button', { name: 'Move Tea room, Rest spot up' }))
    expect(onMove).toHaveBeenCalledWith(waypoints[2]?.id, 0)

    await user.type(screen.getByRole('searchbox', { name: 'Search Rest spot places' }), 'quiet')
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    expect(screen.queryByText('Tea room')).toBeNull()
    expect(screen.getByText('Clear search to reorder places in this category.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(true)
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
      'Edit mode.',
    )
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot up' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(false)

    await user.click(screen.getByRole('button', { name: 'Move Tea room, Rest spot up' }))
    expect(onMove).toHaveBeenCalledWith(waypoints[2].id, 1)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(onRemove).toHaveBeenCalledWith(waypoints[1].id)
  })

  it('opens details from a row while keeping list management actions separate', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onSelect={onSelect}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
      />,
    )

    const detailsButton = screen.getByRole('button', { name: 'Open Quiet bench, Rest spot details' })
    await user.click(detailsButton)

    expect(onSelect).toHaveBeenCalledWith(waypoints[0]?.id, expect.any(HTMLButtonElement))
    expect(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' })).toBeTruthy()

    onSelect.mockClear()
    detailsButton.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(waypoints[0]?.id, detailsButton)
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

  it('disables reordering and clearing while search is active', async () => {
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
    expect(screen.getByText('Clear search to reorder or clear all saved places.'))
      .toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onClearAll).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('searchbox', { name: 'Search saved places' }))
    expect(screen.getByRole('button', { name: 'Move Quiet bench, Rest spot down' }).hasAttribute('disabled'))
      .toBe(false)
    expect(screen.getByRole('button', { name: 'Clear all' }).hasAttribute('disabled'))
      .toBe(false)
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
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'All places 2' }))

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'All places 1' }))
  })
})

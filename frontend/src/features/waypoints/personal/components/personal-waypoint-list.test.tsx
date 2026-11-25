// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
      onMove={(waypointId, targetIndex) => {
        setSavedWaypoints((current) => {
          const from = current.findIndex((waypoint) => waypoint.id === waypointId)
          if (from < 0 || targetIndex < 0 || targetIndex >= current.length) return current
          const next = [...current]
          const [movedWaypoint] = next.splice(from, 1)
          next.splice(targetIndex, 0, movedWaypoint)
          return next
        })
        return true
      }}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).getAnimations
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).getAnimations
})

beforeEach(() => {
  Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [] })
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: () => [] })
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

describe('PersonalWaypointList', () => {
  it('shows a waypoint on the map from its row and offers Directions as a separate action', async () => {
    const user = userEvent.setup()
    const onFocusWaypoint = vi.fn()
    const onDirections = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onFocusWaypoint={onFocusWaypoint}
        onDirections={onDirections}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show Quiet bench, Rest spot on map' }))
    expect(onFocusWaypoint).toHaveBeenCalledWith(waypoints[0])

    await user.click(screen.getByRole('button', { name: 'Directions to Quiet bench, Rest spot' }))
    expect(onDirections).toHaveBeenCalledWith(waypoints[0])
  })

  it('filters saved places by the current search', async () => {
    const user = userEvent.setup()
    const onSearchFilterChange = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onSearchFilterChange={onSearchFilterChange}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    expect(screen.getByRole('region', { name: 'Saved places' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: 'Search saved places' })
    await user.type(search, 'design')
    expect(screen.getByText('Design studio')).toBeTruthy()
    expect(screen.queryByText('Quiet bench')).toBeNull()
    expect(onSearchFilterChange).toHaveBeenLastCalledWith(true)

    await user.clear(search)
    expect(onSearchFilterChange).toHaveBeenLastCalledWith(false)
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Design studioStudy place',
      'Tea roomRest spot',
    ])
  })

  it('shows only places from a fixed category and disables reordering', async () => {
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
      />,
    )

    expect(screen.getByRole('region', { name: 'Saved places in Rest spot' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Categories' })).toBeNull()
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Tea roomRest spot',
    ])

    const categoryHandle = screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' })
    expect(categoryHandle.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Return to All places to reorder saved places.')).toBeTruthy()
    expect(onMove).not.toHaveBeenCalled()

    await user.type(screen.getByRole('searchbox', { name: 'Search Rest spot places' }), 'quiet')
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    expect(screen.queryByText('Tea room')).toBeNull()
    expect(screen.getByText('Return to All places to reorder saved places.')).toBeTruthy()
  })

  it('announces edit mode and exposes labelled reorder and remove controls', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onRemove = vi.fn()
    const onEditAnnouncement = vi.fn()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const view = render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onRemove={onRemove}
        onMove={onMove}
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
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    expect(onEditAnnouncement).toHaveBeenCalledWith('Edit mode.')
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move .* (up|down)/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(onRemove).toHaveBeenCalledWith(waypoints[1].id)
  })

  it('offers a grip handle for reordering without move-up or move-down buttons', () => {
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    expect(screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move .* (up|down)/ })).toBeNull()
  })

  it('supports keyboard start, movement, drop, and focus restoration', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn(() => true)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Design studio, Study place' })
    expect(handle.getAttribute('aria-describedby')).toBe('personal-waypoint-reorder-instructions')
    expect(screen.getByText(/Press Space or Enter to start reordering/)).toBeTruthy()

    handle.focus()
    await user.keyboard('{Space}')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Picked up Design studio, position 2 of 3. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.',
    )

    await user.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Design studioStudy place',
      'Quiet benchRest spot',
      'Tea roomRest spot',
    ])
    expect(onMove).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith(waypoints[1]?.id, 0)
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Design studio moved to position 1 of 3.')
    expect(document.activeElement).toBe(handle)
  })

  it('cancels keyboard reordering and skips writes for a no-op', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn(() => true)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' })
    handle.focus()
    await user.keyboard('{Space}')
    await user.keyboard('{Escape}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Reordering Quiet bench canceled.')

    await user.keyboard('{Space}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Quiet bench remains at position 1 of 3.')
  })

  it('keeps row management controls hidden outside edit mode', () => {
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing={false}
        onFocusWaypoint={() => undefined}
        onDirections={() => undefined}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit Quiet bench, Rest spot' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove Quiet bench, Rest spot' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reorder Quiet bench, Rest spot' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Directions to Quiet bench, Rest spot' })).toBeTruthy()
  })

  it('disables reordering while search is active', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search saved places' }), 'design')
    expect(screen.getByRole('button', { name: 'Reorder Design studio, Study place' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByText('Clear search to reorder or clear all saved places.'))
      .toBeTruthy()
    expect(onMove).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('searchbox', { name: 'Search saved places' }))
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' }).hasAttribute('disabled'))
      .toBe(false)
  })

  it('restores focus to search after removal', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    render(<StatefulPersonalWaypointList />)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))
  })

  it('names the place in the removal prompt and keeps everything when cancelled', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={onRemove}
        onMove={() => true}
      />,
    )

    const removeControl = screen.getByRole('button', { name: 'Remove Design studio, Study place' })
    removeControl.focus()
    await user.click(removeControl)

    expect(confirm).toHaveBeenCalledWith('Delete "Design studio"? This cannot be undone.')
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getAllByRole('listitem').map((row) => row.querySelector('strong')?.textContent))
      .toEqual(['Quiet bench', 'Design studio', 'Tea room'])
    expect(document.activeElement).toBe(removeControl)
  })

  it('removes only the confirmed place and keeps unrelated records', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const view = render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={onRemove}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))

    expect(onRemove).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledWith(waypoints[1].id)

    view.rerender(
      <PersonalWaypointList
        waypoints={waypoints.filter(({ id }) => id !== waypoints[1].id)}
        canEdit
        editing
        onRemove={onRemove}
        onMove={() => true}
      />,
    )

    expect(screen.queryByText('Design studio')).toBeNull()
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    expect(screen.getByText('Tea room')).toBeTruthy()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
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

/** Two places in one category, so keyboard reordering has somewhere to move. */
const reorderWaypoints = [
  createWaypoint(1, 'Alpha desk', 'Study place'),
  createWaypoint(4, 'Beta desk', 'Study place'),
  createWaypoint(3, 'Quiet bench', 'Rest spot'),
]

const baseProps = {
  waypoints,
  canEdit: true,
  editing: false,
  onOpenDetails: () => undefined,
  onRemove: () => undefined,
  onMove: () => true,
}

function StatefulPersonalWaypointList() {
  const [savedWaypoints, setSavedWaypoints] = useState(waypoints)

  return (
    <PersonalWaypointList
      {...baseProps}
      waypoints={savedWaypoints}
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
  // Expansion memory survives between tests in one jsdom window, so start from a clean slate.
  window.localStorage.clear()
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
  it('opens a place details from its single row button', async () => {
    const user = userEvent.setup()
    const onOpenDetails = vi.fn()
    render(<PersonalWaypointList {...baseProps} onOpenDetails={onOpenDetails} />)

    await user.click(screen.getByRole('button', { name: 'Expand all' }))

    const rowButton = screen.getByRole('button', { name: 'Open Quiet bench details' })
    await user.click(rowButton)

    expect(onOpenDetails).toHaveBeenCalledWith(waypoints[0], rowButton)
  })

  it('gives each place row no overflow menu and no Directions control', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    await user.click(screen.getByRole('button', { name: 'Expand all' }))

    for (const { name } of waypoints) {
      const row = screen.getAllByRole('listitem')
        .find((item) => item.textContent === name)
      expect(row).toBeTruthy()

      // The row carries no category subtitle: the group heading already says it.
      expect(row?.textContent).toBe(name)

      const rowButtons = within(row as HTMLElement).getAllByRole('button')
      expect(rowButtons).toHaveLength(1)
      expect(rowButtons[0].getAttribute('aria-label')).toBe(`Open ${name} details`)
    }

    expect(screen.queryByRole('button', { name: /directions/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /more|options|menu/i })).toBeNull()
  })

  it('points every group heading at a region that exists in edit mode too', () => {
    render(<PersonalWaypointList {...baseProps} editing />)

    // Edit list renders groups from a different branch; a missing id there left aria-controls
    // dangling, which assistive technology cannot follow.
    const headings = screen.getAllByRole('button', { name: /^(Expand|Collapse) / })
    expect(headings.length).toBeGreaterThan(0)
    for (const heading of headings) {
      const controls = heading.getAttribute('aria-controls')
      expect(controls).toBeTruthy()
      expect(document.getElementById(controls as string)).toBeTruthy()
    }
  })

  it('toggles a group from its single heading button without navigating', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    // The heading is one disclosure button: it carries the name, the count and the chevron.
    const expand = screen.getByRole('button', { name: 'Expand Rest spot' })
    expect(expand.tagName).toBe('BUTTON')
    expect(expand.textContent).toContain('2 places')
    // The count is rendered once, inside that button.
    expect(screen.getAllByText('2 places')).toHaveLength(1)
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    expect(expand.getAttribute('aria-controls')).toBe(`waypoint-category-list-${encodeURIComponent('Rest spot')}`)
    expect(screen.queryByRole('button', { name: 'Open Quiet bench details' })).toBeNull()
    // A heading is a disclosure, never a way into a separate category screen.
    expect(screen.queryByRole('button', { name: /^Open Rest spot/ })).toBeNull()

    await user.click(expand)
    const collapse = screen.getByRole('button', { name: 'Collapse Rest spot' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    // Expanding happens in place; there is no callback that could navigate away.
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    expect(screen.getByText('Tea room')).toBeTruthy()

    await user.click(collapse)
    expect(screen.queryByRole('button', { name: 'Open Quiet bench details' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand Rest spot' })).toBeTruthy()
  })

  it('renders no category subtitle inside rows and no overflow menu', () => {
    render(<PersonalWaypointList {...baseProps} />)

    // The collection's one overflow menu is owned by the screen header, not the list.
    expect(document.querySelector('.overflow-menu-trigger')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Waypoint list options' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit Quiet bench/ })).toBeNull()
  })

  it('filters saved places by the current search', async () => {
    const user = userEvent.setup()
    const onSearchFilterChange = vi.fn()
    render(<PersonalWaypointList {...baseProps} onSearchFilterChange={onSearchFilterChange} />)

    expect(screen.getByRole('region', { name: 'Saved places' })).toBeTruthy()

    const search = screen.getByRole('searchbox', { name: 'Search saved places' })
    await user.type(search, 'design')
    expect(screen.getByText('Design studio')).toBeTruthy()
    expect(screen.queryByText('Quiet bench')).toBeNull()
    expect(onSearchFilterChange).toHaveBeenLastCalledWith(true)

    await user.clear(search)
    expect(onSearchFilterChange).toHaveBeenLastCalledWith(false)
    // A search force-expands every group; clearing it returns them to their collapsed default.
    expect(screen.queryAllByRole('listitem')).toEqual([])
    expect(screen.getByRole('button', { name: 'Expand Study place' }).textContent).toContain('1 place')
  })

  it('announces edit mode and exposes labelled reorder and remove controls', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    const onRemove = vi.fn()
    const onEditAnnouncement = vi.fn()
    const view = render(
      <PersonalWaypointList
        {...baseProps}
        onRemove={onRemove}
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    view.rerender(
      <PersonalWaypointList
        {...baseProps}
        editing
        onRemove={onRemove}
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    expect(onEditAnnouncement).toHaveBeenCalledWith('Edit mode.')
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move .* (up|down)/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Remove Design studio' }))
    expect(onRemove).toHaveBeenCalledWith(waypoints[1].id)
  })

  it('offers a grip handle for reordering without move-up or move-down buttons', () => {
    render(<PersonalWaypointList {...baseProps} editing />)

    expect(screen.getByRole('button', { name: 'Reorder Quiet bench' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move .* (up|down)/ })).toBeNull()
  })

  it('supports keyboard start, movement, drop, and focus restoration', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn<(waypointId: string, targetIndex: number) => boolean>(() => true)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={reorderWaypoints}
        editing
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Beta desk' })
    expect(handle.getAttribute('aria-describedby')).toBe('personal-waypoint-reorder-instructions')
    expect(screen.getByText(/Press Space or Enter to start reordering/)).toBeTruthy()

    handle.focus()
    await user.keyboard('{Space}')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Picked up Beta desk, position 2 of 2. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.',
    )

    await user.keyboard('{ArrowUp}')
    // Keyboard reordering is scoped to the place's own category, which here holds only two places.
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Beta desk, position 1 of 2.')
    expect(onMove).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0]?.[0]).toBe(reorderWaypoints[1]?.id)
    // Beta desk moves up within Study place, so it must displace Alpha desk, whose flat index is 0.
    // Asserting the exact index is what proves the move is saved: passing the place's own index
    // would make moveWaypoint a no-op and silently lose the reorder.
    expect(onMove.mock.calls[0]?.[1]).toBe(0)
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Beta desk moved to position 1 of 2.')
    expect(document.activeElement).toBe(handle)
  })

  it('saves a keyboard reorder that actually reorders the collection', async () => {
    const user = userEvent.setup()
    const saved: string[][] = []
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={reorderWaypoints}
        editing
        onMove={(waypointId, targetIndex) => {
          // Mirror the store: splice out, insert at the target index, record the result.
          const next = [...reorderWaypoints]
          const from = next.findIndex((waypoint) => waypoint.id === waypointId)
          const [moved] = next.splice(from, 1)
          next.splice(targetIndex, 0, moved)
          saved.push(next.map((waypoint) => waypoint.name))
          return true
        }}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Beta desk' })
    handle.focus()
    await user.keyboard('{Space}{ArrowUp}{Enter}')

    // Beta desk must end up ahead of Alpha desk; a no-op would leave the order unchanged.
    expect(saved).toEqual([['Beta desk', 'Alpha desk', 'Quiet bench']])
  })

  it('cancels keyboard reordering and skips writes for a no-op', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn<(waypointId: string, targetIndex: number) => boolean>(() => true)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={reorderWaypoints}
        editing
        onMove={onMove}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Alpha desk' })
    handle.focus()
    await user.keyboard('{Space}')
    await user.keyboard('{Escape}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Reordering Alpha desk canceled.')

    await user.keyboard('{Space}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Alpha desk remains at position 1 of 2.')
  })

  it('keeps row management controls hidden outside edit mode', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    await user.click(screen.getByRole('button', { name: 'Expand all' }))

    expect(screen.queryByRole('button', { name: 'Edit Quiet bench' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove Quiet bench' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reorder Quiet bench' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Quiet bench details' })).toBeTruthy()
  })

  it('disables reordering while search is active', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<PersonalWaypointList {...baseProps} editing onMove={onMove} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search saved places' }), 'design')
    expect(screen.getByRole('button', { name: 'Reorder Design studio' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByText('Clear search to reorder or clear all saved places.'))
      .toBeTruthy()
    // Search pauses reordering and pins the matching group open.
    expect(screen.getByRole('button', { name: 'Collapse Study place' }).getAttribute('aria-disabled'))
      .toBe('true')
    expect(onMove).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('searchbox', { name: 'Search saved places' }))
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench' }).hasAttribute('disabled'))
      .toBe(false)
  })

  it('restores focus to search after removal', async () => {
    const user = userEvent.setup()
    render(<StatefulPersonalWaypointList />)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))
  })
})

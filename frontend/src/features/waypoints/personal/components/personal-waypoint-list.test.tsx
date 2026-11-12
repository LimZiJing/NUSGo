// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { moveGroupedWaypointFromDrag, resolveInsertionIndexFromPointer } from './personal-waypoint-group-drag'
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
  window.localStorage.removeItem('navus:personal-waypoints:expanded-categories:v1')
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
  beforeEach(() => {
    // jsdom has no dialog implementation; the component falls back to the `open` attribute.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function close(this: HTMLDialogElement) { this.removeAttribute('open') },
    })
  })
  it.each([
    { name: 'down within a category', source: waypoints[0]!, targetId: waypoints[0]!.id, group: 'Rest spot', index: 1, expected: ['Rest spot', 1] as const },
    { name: 'up within a category', source: waypoints[2]!, targetId: waypoints[2]!.id, group: 'Rest spot', index: 0, expected: ['Rest spot', 0] as const },
    { name: 'before a row in another category', source: waypoints[0]!, targetId: waypoints[1]!.id, targetGroup: 'Study place', targetIndex: 0, expected: ['Study place', 0] as const },
    { name: 'after a row in another category', source: waypoints[0]!, targetId: waypoints[1]!.id, targetGroup: 'Study place', targetIndex: 1, expected: ['Study place', 1] as const },
    { name: 'onto a collapsed category heading', source: waypoints[0]!, targetId: 'personal-waypoint-category:Study%20place', expected: ['Study place', 1] as const },
  ])('resolves grouped drag $name to the exact insertion callback', ({ source, targetId, group, index, targetGroup, targetIndex, expected }) => {
    const onMoveToPosition = vi.fn(() => true)
    const result = moveGroupedWaypointFromDrag({
      waypointId: source.id,
      targetId,
      sourceGroup: group,
      sourceIndex: index,
      targetGroup,
      targetIndex,
      waypoints,
      onMoveToPosition,
    })

    expect(result.kind).toBe('moved')
    expect(onMoveToPosition).toHaveBeenCalledExactlyOnceWith(source.id, expected[0], expected[1])
  })

  it('resolves pointer insertion so a row drop keeps its exact half-of-row position', () => {
    // Midpoints for W1 and W2 rows sit at 100 and 200.
    expect(resolveInsertionIndexFromPointer([100, 200], 60)).toBe(0)
    expect(resolveInsertionIndexFromPointer([100, 200], 140)).toBe(1)
    expect(resolveInsertionIndexFromPointer([100, 200], 260)).toBe(2)
  })

  it('prefers the pointer-derived index over the projected one so lower-half drops do not append', () => {
    const onMoveToPosition = vi.fn(() => true)
    const result = moveGroupedWaypointFromDrag({
      waypointId: waypoints[0]!.id,
      targetId: waypoints[1]!.id,
      targetGroup: 'Study place',
      targetIndex: 0,
      resolvedIndex: 1,
      waypoints,
      onMoveToPosition,
    })

    expect(result.kind).toBe('moved')
    expect(onMoveToPosition).toHaveBeenCalledExactlyOnceWith(waypoints[0]!.id, 'Study place', 1)
  })

  it('falls back to appending when the destination has no measurable rows', () => {
    const onMoveToPosition = vi.fn(() => true)
    const result = moveGroupedWaypointFromDrag({
      waypointId: waypoints[0]!.id,
      targetId: 'personal-waypoint-category:Study%20place',
      resolvedIndex: undefined,
      waypoints,
      onMoveToPosition,
    })

    expect(result.kind).toBe('moved')
    expect(onMoveToPosition).toHaveBeenCalledExactlyOnceWith(waypoints[0]!.id, 'Study place', 1)
  })

  it('keeps both category lists mounted after a grouped move to an exact position', () => {
    let savedWaypoints = [...waypoints]
    const onMoveToPosition = vi.fn((waypointId: string, category: string, insertionIndex: number) => {
      const moved = savedWaypoints.find(({ id }) => id === waypointId)!
      const remaining = savedWaypoints.filter(({ id }) => id !== waypointId)
      const inCategory = remaining.filter(({ category: current }) => current === category)
      const anchor = inCategory[insertionIndex]
      const anchorIndex = anchor ? remaining.findIndex(({ id }) => id === anchor.id) : remaining.length
      savedWaypoints = [...remaining.slice(0, anchorIndex), { ...moved, category }, ...remaining.slice(anchorIndex)]
      view.rerender(<PersonalWaypointList waypoints={savedWaypoints} canEdit editing onRemove={() => undefined} onMove={() => true} onMoveToPosition={onMoveToPosition} />)
      return true
    })
    const view = render(<PersonalWaypointList waypoints={savedWaypoints} canEdit editing onRemove={() => undefined} onMove={() => true} onMoveToPosition={onMoveToPosition} />)

    act(() => {
      moveGroupedWaypointFromDrag({
        waypointId: waypoints[0]!.id,
        targetId: waypoints[1]!.id,
        targetGroup: 'Study place',
        targetIndex: 1,
        waypoints: savedWaypoints,
        onMoveToPosition,
      })
    })

    expect(onMoveToPosition).toHaveBeenCalledExactlyOnceWith(waypoints[0]!.id, 'Study place', 1)
    expect(within(screen.getByRole('list', { name: 'Rest spot waypoints' })).getByText('Tea room')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Study place waypoints' })).getByText('Quiet bench')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Study place waypoints' })).getByText('Design studio')).toBeTruthy()
  })

  it('keeps grouped keyboard reordering inside its category and in the grouped layout', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn(() => true)
    const onMoveToPosition = vi.fn(() => true)
    const onEditAnnouncement = vi.fn()
    // Flat order Alpha, Beta, Alpha: a flat index would land P1 next to P2 in another group.
    const flat = [
      createWaypoint(51, 'P1', 'Alpha'),
      createWaypoint(52, 'P2', 'Beta'),
      createWaypoint(53, 'P3', 'Alpha'),
    ]
    render(
      <PersonalWaypointList
        waypoints={flat}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={onMove}
        onMoveToPosition={onMoveToPosition}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Expand all' }))

    const handle = screen.getByRole('button', { name: 'Reorder P1, Alpha' })
    handle.focus()
    await user.keyboard('{Space}')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Picked up P1, position 1 of 2 in Alpha. Use the arrow keys to move it. Press Enter or Space to save, or Escape to cancel.',
    )
    await user.keyboard('{ArrowDown}')
    // The groups stay mounted while reordering, so the card layout does not jump to the flat list.
    expect(screen.getByRole('region', { name: 'Alpha, 2 places' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Beta, 1 places' })).toBeTruthy()

    await user.keyboard('{Enter}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onMoveToPosition).toHaveBeenCalledExactlyOnceWith(flat[0]!.id, 'Alpha', 1)
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('P1 moved to position 2 of 2 in Alpha.')
  })

  it('keeps the moved handle focused when it lands in a collapsed category', async () => {
    const user = userEvent.setup()
    const quietBench = waypoints[0]!
    function MovingList() {
      const [saved, setSaved] = useState(waypoints)
      return <PersonalWaypointList
        waypoints={saved}
        canEdit
        editing
        moveCategoryOptions={['Rest spot', 'Study place']}
        onMoveToCategory={(waypointId, category) => {
          setSaved((current) => current.map((waypoint) => waypoint.id === waypointId ? { ...waypoint, category } : waypoint))
          return true
        }}
        onRemove={() => undefined}
        onMove={() => true}
      />
    }
    render(<MovingList />)

    // Collapse the destination group so its rows are mounted but hidden when focus is restored.
    await user.click(screen.getByRole('button', { name: /Study place.*1/ }))
    expect(document.getElementById('waypoint-category-list-Study%20place')?.hasAttribute('hidden')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Waypoint options for Quiet bench, Rest spot' }))
    await user.click(screen.getByRole('button', { name: 'Move to category' }))
    await user.click(screen.getByRole('combobox', { name: 'Move Quiet bench to category' }))
    await user.click(screen.getByRole('option', { name: 'Study place' }))

    expect(screen.getByRole('region', { name: 'Study place, 2 places' })).toBeTruthy()
    expect(document.getElementById('waypoint-category-list-Study%20place')?.hasAttribute('hidden')).toBe(true)
    // A hidden row cannot take focus, so focus lands on the heading the place moved into.
    expect(document.activeElement?.textContent).toContain('Study place')
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).not.toBe(document.body)
    expect(quietBench.name).toBe('Quiet bench')
  })

  it('restores focus to a moved waypoint handle after its source category disappears', async () => {
    const user = userEvent.setup()
    const source = createWaypoint(41, 'Only place', 'Alpha')
    const destination = createWaypoint(42, 'Work place', 'Work')
    function MovingList() {
      const [saved, setSaved] = useState([source, destination])
      return <PersonalWaypointList
        waypoints={saved}
        canEdit
        editing
        moveCategoryOptions={['Alpha', 'Work']}
        onMoveToCategory={(waypointId, category) => {
          setSaved((current) => current.map((waypoint) => waypoint.id === waypointId ? { ...waypoint, category } : waypoint))
          return true
        }}
        onRemove={() => undefined}
        onMove={() => true}
      />
    }
    render(<MovingList />)
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    await user.click(screen.getByRole('button', { name: 'Waypoint options for Only place, Alpha' }))
    await user.click(screen.getByRole('button', { name: 'Move to category' }))
    await user.click(screen.getByRole('combobox', { name: 'Move Only place to category' }))
    await user.click(screen.getByRole('option', { name: 'Work' }))

    expect(screen.queryByRole('region', { name: 'Alpha, 1 places' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reorder Only place, Work' })).toBe(document.activeElement)
  })

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

    await user.click(screen.getByRole('button', { name: 'Expand all' }))

    await user.click(screen.getByRole('button', { name: 'Open Quiet bench, Rest spot details' }))
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
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Quiet benchRest spot',
      'Tea roomRest spot',
      'Design studioStudy place',
    ])
  })

  it('starts groups collapsed, reveals matching groups during search, and restores expansion state', async () => {
    const user = userEvent.setup()
    window.localStorage.clear()
    const { unmount } = render(
      <PersonalWaypointList waypoints={waypoints} canEdit editing={false} onRemove={() => undefined} onMove={() => true} />,
    )
    expect(screen.getByRole('button', { name: 'Rest spot options' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /Rest spot.*2/ }).getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('waypoint-category-list-Rest%20spot')?.hasAttribute('hidden')).toBe(true)
    await user.click(screen.getByRole('button', { name: /Rest spot.*2/ }))
    const search = screen.getByRole('searchbox', { name: 'Search saved places' })
    await user.type(search, 'Design')
    expect(screen.getByRole('button', { name: 'Open Design studio, Study place details' })).toBeTruthy()
    await user.clear(search)
    expect(screen.getByRole('button', { name: /Rest spot.*2/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Study place.*1/ }).getAttribute('aria-expanded')).toBe('false')
    unmount()
    render(<PersonalWaypointList waypoints={waypoints} canEdit editing={false} onRemove={() => undefined} onMove={() => true} />)
    expect(screen.getByText('Quiet bench')).toBeTruthy()
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

  it('enables grouped drag targets only in unfiltered Edit list', async () => {
    const user = userEvent.setup()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRemove={() => undefined}
        onMove={() => true}
        onMoveToPosition={() => true}
      />,
    )

    expect(screen.getByRole('region', { name: 'Rest spot, 2 places' }).className)
      .toContain('personal-waypoint-category-drop-target')
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' }).hasAttribute('disabled'))
      .toBe(false)

    await user.type(screen.getByRole('searchbox', { name: 'Search saved places' }), 'quiet')
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench, Rest spot' }).hasAttribute('disabled'))
      .toBe(true)
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
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Reorder Design studio, Study place')
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

  it('keeps row management controls hidden outside edit mode', async () => {
    const user = userEvent.setup()
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
    expect(screen.getByRole('button', { name: /Rest spot.*2/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Rest spot.*2/ }))
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
    render(<StatefulPersonalWaypointList />)

    await user.click(screen.getByRole('button', { name: 'Remove Design studio, Study place' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search saved places' }))
  })

  it('renames a category inline and returns focus to its heading', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => true)
    const view = render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))

    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    expect(document.activeElement).toBe(input)
    await user.clear(input)
    await user.type(input, 'Relaxation{Enter}')

    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Relaxation')
    expect(screen.getByRole('status').textContent).toContain('Category renamed to Relaxation.')
    // The parent owns the data, so re-render with the renamed list to see the new heading.
    view.rerender(
      <PersonalWaypointList
        waypoints={waypoints.map((waypoint) => waypoint.category === 'Rest spot' ? { ...waypoint, category: 'Relaxation' } : waypoint)}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )
    expect(screen.getByRole('button', { name: /Relaxation.*2/ })).toBeTruthy()
  })

  it('leaves the original category untouched when a rename is cancelled or rejected', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => false)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    await user.clear(screen.getByRole('textbox', { name: 'Rename Rest spot category' }))
    await user.type(screen.getByRole('textbox', { name: 'Rename Rest spot category' }), 'Nothing{Escape}')

    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Rest spot.*2/ })).toBeTruthy()
    expect(document.activeElement?.id).toBe('waypoint-category-heading-Rest%20spot')

    // A rejected write keeps the original name and says so.
    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(input)
    await user.type(input, 'Changed{Enter}')
    expect(onRenameCategory).toHaveBeenCalledWith('Rest spot', 'Changed')
    expect(onRenameCategory).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('The category could not be renamed. Saved data was not changed.')
    expect(screen.getByRole('textbox', { name: 'Rename Rest spot category' })).toBe(document.activeElement)
  })

  it('asks before merging into an existing category and reports the visibility label', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => true)
    const onMergeCategoryVisibility = vi.fn(() => true)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        hiddenCategories={['Rest spot']}
        onRenameCategory={onRenameCategory}
        onMergeCategoryVisibility={onMergeCategoryVisibility}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')

    const dialog = screen.getByRole('dialog', { name: 'Merge into Study place?' })
    expect(dialog).toBeTruthy()
    // Nothing is rewritten until the user confirms.
    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Shown on map after merging')).toBeTruthy()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))

    await user.click(within(dialog).getByRole('button', { name: 'Merge categories' }))
    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Study place')
    expect(onMergeCategoryVisibility).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Study place')
    expect(screen.getByRole('status').textContent).toContain('Merged Rest spot into Study place.')
    expect(screen.getByRole('status').textContent).toContain('Shown on map after merging')
  })

  it('cancelling a merge keeps the original category and restores its heading', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => true)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement?.id).toBe('waypoint-category-heading-Rest%20spot')
  })

  it('focuses the first menu item and the rename field from a keyboard-opened menu', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => true)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    // Opening the menu by keyboard must move focus to its first item, which is Rename category.
    const trigger = screen.getByRole('button', { name: 'Rest spot options' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const firstItem = screen.getByRole('button', { name: 'Rename category' })
    expect(document.activeElement).toBe(firstItem)
    await user.keyboard('{Enter}')

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename Rest spot category' })
    expect(document.activeElement).toBe(input)
    // Typing replaces the current name instead of appending to it.
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Rest spot'.length])
    await user.keyboard('Quiet corner{Enter}')

    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Quiet corner')
  })

  it('returns focus to the source heading when a merge write is refused', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn(() => false)
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        onRenameCategory={onRenameCategory}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')
    await user.click(screen.getByRole('button', { name: 'Merge categories' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('The categories could not be merged. Saved data was not changed.')
    expect(document.activeElement?.id).toBe('waypoint-category-heading-Rest%20spot')
  })

  it('hides the merge label when both categories were hidden', async () => {
    const user = userEvent.setup()
    render(
      <PersonalWaypointList
        waypoints={waypoints}
        canEdit
        editing
        hiddenCategories={['Rest spot', 'Study place']}
        onRenameCategory={() => true}
        onRemove={() => undefined}
        onMove={() => true}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rest spot options' }))
    await user.click(screen.getByRole('button', { name: 'Rename category' }))
    const input = screen.getByRole('textbox', { name: 'Rename Rest spot category' })
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')

    expect(within(screen.getByRole('dialog')).getByText('Hidden on map after merging')).toBeTruthy()
  })
})

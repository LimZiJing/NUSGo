// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
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
  onMove: () => undefined,
  onReorder: () => undefined,
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
      onMove={(waypointId, category) => {
        setSavedWaypoints((current) => current.map((waypoint) => (
          waypoint.id === waypointId ? { ...waypoint, category } : waypoint
        )))
      }}
      onReorder={(waypointId, targetIndex) => {
        setSavedWaypoints((current) => {
          const from = current.findIndex((waypoint) => waypoint.id === waypointId)
          if (from < 0 || targetIndex < 0 || targetIndex >= current.length) return current
          const next = [...current]
          const [movedWaypoint] = next.splice(from, 1)
          next.splice(targetIndex, 0, movedWaypoint)
          return next
        })
      }}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).getAnimations
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).getAnimations
  delete (window.HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal
  delete (window.HTMLDialogElement.prototype as unknown as Record<string, unknown>).close
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
  // jsdom implements `dialog.open` but not the modal methods, so give the ConfirmDialog the
  // behaviour a browser provides: showModal opens it, close closes it.
  Object.defineProperty(window.HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(window.HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false
    },
  })
})

describe('PersonalWaypointList', () => {
  it('offers one expand-all toggle that flips instead of two buttons', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    // Groups start collapsed, so the control offers to open them and says so.
    const expand = screen.getByRole('button', { name: 'Expand all categories' })
    // A pair of always-present buttons meant one was permanently inert; only one exists now.
    expect(screen.queryByRole('button', { name: 'Collapse all categories' })).toBeNull()

    await user.click(expand)
    expect(screen.getByRole('button', { name: 'Collapse all categories' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Expand all categories' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Collapse all categories' }))
    expect(screen.getByRole('button', { name: 'Expand all categories' })).toBeTruthy()
  })

  it('hides the expand-all toggle when it could not change anything', () => {
    // One group: there is no "all" to act on.
    render(<PersonalWaypointList {...baseProps} waypoints={[createWaypoint(1, 'Solo', 'Work')]} />)
    expect(screen.queryByRole('button', { name: /all categories/ })).toBeNull()
  })

  it('opens a place details from its single row button', async () => {
    const user = userEvent.setup()
    const onOpenDetails = vi.fn()
    render(<PersonalWaypointList {...baseProps} onOpenDetails={onOpenDetails} />)

    await user.click(screen.getByRole('button', { name: 'Expand all categories' }))

    const rowButton = screen.getByRole('button', { name: 'Open Quiet bench details' })
    await user.click(rowButton)

    expect(onOpenDetails).toHaveBeenCalledWith(waypoints[0], rowButton)
  })

  it('gives each place row no overflow menu and no Directions control', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    await user.click(screen.getByRole('button', { name: 'Expand all categories' }))

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
    // dangling, which assistive technology cannot follow. The expand-all toggle is also named
    // "Expand…", so it is excluded: it controls no single region.
    const headings = screen.getAllByRole('button', { name: /^(Expand|Collapse) (?!all categories)/ })
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
    const onReorder = vi.fn<(waypointId: string, targetIndex: number) => void>()
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={reorderWaypoints}
        editing
        onReorder={onReorder}
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
    expect(onReorder).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onReorder).toHaveBeenCalledOnce()
    expect(onReorder.mock.calls[0]?.[0]).toBe(reorderWaypoints[1]?.id)
    // Beta desk moves up within Study place, so it must displace Alpha desk, whose flat index is 0.
    // Asserting the exact index is what proves the move is saved: passing the place's own index
    // would make moveWaypoint a no-op and silently lose the reorder.
    expect(onReorder.mock.calls[0]?.[1]).toBe(0)
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
        onReorder={(waypointId, targetIndex) => {
          // Mirror the session: splice out, insert at the target index, record the result.
          const next = [...reorderWaypoints]
          const from = next.findIndex((waypoint) => waypoint.id === waypointId)
          const [moved] = next.splice(from, 1)
          next.splice(targetIndex, 0, moved)
          saved.push(next.map((waypoint) => waypoint.name))
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
    const onReorder = vi.fn<(waypointId: string, targetIndex: number) => void>()
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={reorderWaypoints}
        editing
        onReorder={onReorder}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const handle = screen.getByRole('button', { name: 'Reorder Alpha desk' })
    handle.focus()
    await user.keyboard('{Space}')
    await user.keyboard('{Escape}')
    expect(onReorder).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Reordering Alpha desk canceled.')

    await user.keyboard('{Space}')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')
    expect(onReorder).not.toHaveBeenCalled()
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Alpha desk remains at position 1 of 2.')
  })

  it('keeps row management controls hidden outside edit mode', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...baseProps} />)

    await user.click(screen.getByRole('button', { name: 'Expand all categories' }))

    expect(screen.queryByRole('button', { name: 'Edit Quiet bench' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove Quiet bench' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reorder Quiet bench' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Quiet bench details' })).toBeTruthy()
  })

  it('does not let a row open details while the list is being edited', async () => {
    // Editing the list is a separate job from editing a place. A tap that opened details would
    // replace the whole pending edit — moves, reorders and removals that are not written yet — so
    // the row stops being a way in until the edit is confirmed or cancelled.
    const onOpenDetails = vi.fn()
    render(<PersonalWaypointList {...baseProps} editing onOpenDetails={onOpenDetails} />)

    expect(screen.queryByRole('button', { name: /^Open .* details$/ })).toBeNull()
    // The row is still present and still shows the place, just not as a control.
    expect(screen.getByText('Quiet bench')).toBeTruthy()
    // The edit affordances are the ones that remain.
    expect(screen.getByRole('button', { name: 'Reorder Quiet bench' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Quiet bench' })).toBeTruthy()
    expect(onOpenDetails).not.toHaveBeenCalled()
  })

  it('disables reordering while search is active', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
    render(<PersonalWaypointList {...baseProps} editing onReorder={onReorder} />)

    await user.type(screen.getByRole('searchbox', { name: 'Search saved places' }), 'design')
    expect(screen.getByRole('button', { name: 'Reorder Design studio' }).hasAttribute('disabled'))
      .toBe(true)
    expect(screen.getByText('Clear search to reorder or move saved places.'))
      .toBeTruthy()
    // Search pauses reordering and pins the matching group open.
    expect(screen.getByRole('button', { name: 'Collapse Study place' }).getAttribute('aria-disabled'))
      .toBe('true')
    expect(onReorder).not.toHaveBeenCalled()

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

describe('PersonalWaypointList category renaming', () => {
  const renameProps = {
    ...baseProps,
    onRenameCategory: vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints),
  }

  async function openRenameField(user: UserEvent, category: string): Promise<HTMLInputElement> {
    await user.click(screen.getByRole('button', { name: `Rename ${category} category` }))
    const input = screen.getByRole('textbox', { name: `Rename ${category} category` }) as HTMLInputElement
    // The header focuses and selects the field in a follow-up frame.
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
      expect(input.selectionStart).toBe(0)
    })
    return input
  }

  it('offers no rename control outside edit mode', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...renameProps} />)

    await user.click(screen.getByRole('button', { name: 'Expand all categories' }))

    expect(screen.queryByRole('button', { name: /^Rename .* category$/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^Rename .* category$/ })).toBeNull()
  })

  it('shows a trailing pencil on each group heading in edit mode', () => {
    render(<PersonalWaypointList {...renameProps} editing />)

    const pencils = screen.getAllByRole('button', { name: /^Rename .* category$/ })
    expect(pencils).toHaveLength(new Set(waypoints.map(({ category }) => category)).size)
    expect(screen.getByRole('button', { name: 'Rename Rest spot category' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename Study place category' })).toBeTruthy()
  })

  it('opens an inline field with the current name preselected', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointList {...renameProps} editing />)

    const input = await openRenameField(user, 'Rest spot')

    expect(input.value).toBe('Rest spot')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('Rest spot'.length)
    expect(screen.getByRole('button', { name: 'Save Rest spot category name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel renaming Rest spot' })).toBeTruthy()
    // The heading itself steps aside while its name is being edited.
    expect(screen.queryByRole('button', { name: /^(Expand|Collapse) Rest spot$/ })).toBeNull()
  })

  it('commits a new name on Enter and reports the rename', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        editing
        onRenameCategory={onRenameCategory}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Break spot{Enter}')

    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Break spot')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith('Renamed Rest spot to Break spot.')
    expect(screen.queryByRole('textbox', { name: /^Rename .* category$/ })).toBeNull()
  })

  it('cancels with Escape without renaming', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    render(<PersonalWaypointList {...baseProps} editing onRenameCategory={onRenameCategory} />)

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Break spot{Escape}')

    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /^Rename .* category$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename Rest spot category' })).toBeTruthy()
  })

  it('asks before merging into an existing category and only renames on confirmation', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    const onMergeCategoryVisibility = vi.fn<(from: string, to: string) => boolean | null>(() => true)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        editing
        onRenameCategory={onRenameCategory}
        onMergeCategoryVisibility={onMergeCategoryVisibility}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')

    // Nothing is written until the merge is confirmed.
    expect(onRenameCategory).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toBe('confirm-dialog')
    expect(within(dialog).getByText('Merge “Rest spot” into “Study place”?')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Merge categories' }))

    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Study place')
    expect(onMergeCategoryVisibility).toHaveBeenCalledWith('Rest spot', 'Study place')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Merged Rest spot into Study place. Shown on map after merging.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports a visibility answer of hidden after merging', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        editing
        onRenameCategory={onRenameCategory}
        onMergeCategoryVisibility={() => false}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Merge categories' }))

    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Merged Rest spot into Study place. Hidden on map after merging.',
    )
  })

  it('says the map visibility could not be saved when the answer is unknown', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    const onEditAnnouncement = vi.fn()
    render(
      <PersonalWaypointList
        {...baseProps}
        editing
        onRenameCategory={onRenameCategory}
        onMergeCategoryVisibility={() => null}
        onEditAnnouncement={onEditAnnouncement}
      />,
    )

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Merge categories' }))

    expect(onRenameCategory).toHaveBeenCalledExactlyOnceWith('Rest spot', 'Study place')
    expect(onEditAnnouncement).toHaveBeenLastCalledWith(
      'Merged Rest spot into Study place. Its map visibility could not be saved.',
    )
  })

  it('leaves the collection untouched when the merge is cancelled', async () => {
    const user = userEvent.setup()
    const onRenameCategory = vi.fn<(from: string, to: string) => readonly PersonalWaypoint[] | null>(() => waypoints)
    render(<PersonalWaypointList {...baseProps} editing onRenameCategory={onRenameCategory} />)

    const input = await openRenameField(user, 'Rest spot')
    await user.clear(input)
    await user.type(input, 'Study place{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('PersonalWaypointList cross-category movement', () => {
  it('renders a category the pending edits emptied, so it stays a drop target', () => {
    // A group with no place left still has to exist on screen, because it is where a place can be
    // moved back into before confirming.
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={[createWaypoint(1, 'Water cooler', 'Work')]}
        editing
        editingCategories={['Misc', 'Work']}
      />,
    )

    expect(screen.getByRole('button', { name: /Misc/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Work/ })).toBeTruthy()
  })

  it('says an emptied category is a drop target instead of showing a bare gap', async () => {
    const user = userEvent.setup()
    render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={[createWaypoint(1, 'Water cooler', 'Work')]}
        editing
        editingCategories={['Misc', 'Work']}
      />,
    )

    // Edit mode expands every group, so the emptied category's rows are already showing.
    expect(screen.getByRole('button', { name: 'Collapse Misc' })).toBeTruthy()
    expect(screen.getByText(/Drop one here to move it into this category/)).toBeTruthy()

    // Collapsing still works, which proves the heading is the real disclosure rather than a label.
    await user.click(screen.getByRole('button', { name: 'Collapse Misc' }))
    expect(screen.getByRole('button', { name: 'Expand Misc' })).toBeTruthy()
  })

  it('marks a category card as a drop target so the pointer has something to aim at', () => {
    render(<PersonalWaypointList {...baseProps} editing />)

    const cards = document.querySelectorAll('.personal-waypoint-category-group')
    expect(cards.length).toBeGreaterThan(0)
    // Every card declares its drop state, which is what the highlight is drawn from.
    for (const card of cards) {
      expect(card.getAttribute('data-drop-target')).toBe('false')
    }
  })

  it('keeps exactly one row per place when the same place changes category repeatedly', async () => {
    // Moving a place between categories re-renders it under a different group. A duplicate or an
    // orphaned node left in the list is what made the next drag throw "The node to be removed is not
    // a child of this node", so the invariant is: one row per place, every one of them React-owned.
    // The pointer gesture cannot be driven in jsdom, so this exercises the state it produces.
    const moved = vi.fn()
    const { rerender } = render(
      <PersonalWaypointList
        {...baseProps}
        waypoints={[
          createWaypoint(1, 'Water cooler', 'Misc'),
          createWaypoint(2, 'Quiet bench', 'Work'),
        ]}
        editing
        editingCategories={['Misc', 'Work']}
        onMove={moved}
      />,
    )

    const assertOneRowPerPlace = (): void => {
      const rows = Array.from(document.querySelectorAll('.personal-waypoint-row'))
      expect(rows.length).toBe(2)
      // React owns every rendered row; an orphaned clone would carry no React fiber.
      for (const row of rows) {
        expect(Object.keys(row).some((key) => key.startsWith('__reactFiber$'))).toBe(true)
      }
      // Each place renders once. While editing, the row is not a way into details (see the
      // edit-mode test below), so the count is taken from the titles rather than the buttons.
      const waterCoolerTitles = rows.filter((row) => row.textContent?.includes('Water cooler'))
      expect(waterCoolerTitles.length).toBe(1)
    }
    assertOneRowPerPlace()

    // The same place, moved out and back — the sequence that used to leave a stray row behind.
    for (const category of ['Work', 'Misc', 'Work']) {
      rerender(
        <PersonalWaypointList
          {...baseProps}
          waypoints={[
            createWaypoint(1, 'Water cooler', category),
            createWaypoint(2, 'Quiet bench', 'Work'),
          ]}
          editing
          editingCategories={['Misc', 'Work']}
          onMove={moved}
        />,
      )
      assertOneRowPerPlace()
    }

    // The row now lives under its new category rather than being duplicated across both.
    const groups = Array.from(document.querySelectorAll('.personal-waypoint-category-group'))
    const work = groups.find((group) => group.textContent?.includes('Work'))
    expect(work?.querySelectorAll('.personal-waypoint-row').length).toBe(2)
    // A category the pending edits emptied stays on screen as a drop target.
    expect(screen.getByRole('button', { name: /Misc/ })).toBeTruthy()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypointStoreReadResult } from '../../../domain/waypoints/personal/personal-waypoint-store'
import { PersonalWaypointsHome } from './personal-waypoints-home'

const waypoint: PersonalWaypoint = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quiet bench',
  category: 'Rest spot',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

const readyResult: PersonalWaypointStoreReadResult = {
  kind: 'ready',
  waypoints: [waypoint],
  revision: null,
  rejectedRecords: { count: 0, issues: [] },
}

const noop = () => undefined
const waypointHomeCallbacks = {
  onEditWaypoint: noop,
  categoryOptions: [],
  hiddenCategories: [],
  draftHiddenCategories: [],
  categoryPickerOpen: false,
  selectedCategory: null,
  categoryVisibilityStatus: null,
  onSetCategoryVisible: noop,
  onOpenCategory: noop,
  onBackToCategories: noop,
  onToggleCategoryPicker: noop,
  onClearCategoryVisibilityChanges: noop,
  onCancelCategoryVisibilityChanges: noop,
  onDoneCategoryVisibilityChanges: noop,
}

function StatefulPersonalWaypointsHome() {
  const [readResult, setReadResult] = useState(readyResult)

  return (
    <PersonalWaypointsHome
      {...waypointHomeCallbacks}
      readResult={readResult}
      status={null}
      onAdd={() => undefined}
      editing
      onSelectWaypoint={() => undefined}
      onRemove={(waypointId) => setReadResult((current) => {
        if (current.kind !== 'ready') return current
        return {
          ...current,
          waypoints: current.waypoints.filter(({ id }) => id !== waypointId),
        }
      })}
      onMove={() => undefined}
      onClearAll={() => undefined}
      onResetUnreadableData={() => undefined}
      onDiscardRejectedRecords={() => undefined}
      categoryOptions={[{ category: 'Rest spot', waypointCount: 1 }]}
      hiddenCategories={[]}
      categoryVisibilityStatus={null}
      onSetCategoryVisible={() => undefined}
    />
  )
}

afterEach(cleanup)

describe('PersonalWaypointsHome', () => {
  it('keeps the panel concise and announces edit mode without visible instructions', async () => {
    const props = {
      ...waypointHomeCallbacks,
      readResult: readyResult,
      status: 'Waypoint order saved.',
      onAdd: () => undefined,
      onSelectWaypoint: () => undefined,
      onRemove: () => undefined,
      onMove: () => undefined,
      onClearAll: () => undefined,
      onResetUnreadableData: () => undefined,
      onDiscardRejectedRecords: () => undefined,
      categoryOptions: [{ category: 'Rest spot', waypointCount: 1 }],
      hiddenCategories: [],
      categoryVisibilityStatus: null,
      onSetCategoryVisible: () => undefined,
    }
    const view = render(<PersonalWaypointsHome {...props} editing={false} />)

    expect(screen.queryByText('Personal Waypoints are saved in this browser profile.')).toBeNull()
    expect(screen.queryByText('Choose which categories appear on the map.')).toBeNull()

    view.rerender(<PersonalWaypointsHome {...props} editing />)
    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(1)
      expect(screen.getByRole('status').textContent).toContain('Waypoint order saved.')
      expect(screen.getByText('Edit mode.').className).toContain('visually-hidden')
    })
  })

  it('keeps saved places while opening category visibility controls', async () => {
    const user = userEvent.setup()
    const onSetCategoryVisible = vi.fn()
    const onClearCategoryVisibilityChanges = vi.fn()
    const secondWaypoint = { ...waypoint, id: '00000000-0000-4000-8000-000000000002', name: 'Cafe', category: 'Food & drink' }
    render(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={{ ...readyResult, waypoints: [waypoint, secondWaypoint] }}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={() => undefined}
        onDiscardRejectedRecords={() => undefined}
        categoryOptions={[
          { category: 'Food & drink', waypointCount: 1 },
          { category: 'Rest spot', waypointCount: 1 },
        ]}
        categoryPickerOpen
        hiddenCategories={['Food & drink']}
        categoryVisibilityStatus={null}
        onSetCategoryVisible={onSetCategoryVisible}
        onClearCategoryVisibilityChanges={onClearCategoryVisibilityChanges}
      />,
    )

    expect((screen.getByRole('checkbox', { name: 'Show Food & drink markers' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('Cafe')).toBeTruthy()
    expect(screen.getByText('Quiet bench')).toBeTruthy()

    await user.click(screen.getByRole('checkbox', { name: 'Show Food & drink markers' }))
    expect(onSetCategoryVisible).toHaveBeenCalledWith('Food & drink', true)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClearCategoryVisibilityChanges).toHaveBeenCalledWith(['Food & drink', 'Rest spot'])
  })

  it('offers one Edit action for each place on the main list', async () => {
    const user = userEvent.setup()
    const onEditWaypoint = vi.fn()
    render(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={readyResult}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onEditWaypoint={onEditWaypoint}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={() => undefined}
        onDiscardRejectedRecords={() => undefined}
        categoryOptions={[{ category: 'Rest spot', waypointCount: 1 }]}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Open Quiet bench, Rest spot details' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit Quiet bench, Rest spot' }))
    expect(onEditWaypoint).toHaveBeenCalledWith(waypoint.id)
  })

  it('shows only the selected category and keeps Add waypoint on the main screen', async () => {
    const user = userEvent.setup()
    const onBackToCategories = vi.fn()
    const view = render(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={readyResult}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={() => undefined}
        onDiscardRejectedRecords={() => undefined}
        categoryOptions={[{ category: 'Rest spot', waypointCount: 1 }]}
        selectedCategory="Rest spot"
        onBackToCategories={onBackToCategories}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Add waypoint' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Rest spot 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to categories' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to categories' }))
    expect(onBackToCategories).toHaveBeenCalledOnce()

    view.rerender(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={readyResult}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={() => undefined}
        onDiscardRejectedRecords={() => undefined}
        categoryOptions={[{ category: 'Rest spot', waypointCount: 1 }]}
        selectedCategory={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add waypoint' })).toBeTruthy()
  })

  it('restores focus to the page empty state when the last waypoint is removed', async () => {
    const user = userEvent.setup()
    render(<StatefulPersonalWaypointsHome />)

    await user.click(screen.getByRole('button', { name: 'Remove Quiet bench, Rest spot' }))

    const emptyState = screen.getByText('No saved waypoints yet. Add a waypoint to start your list.')
    expect(document.activeElement).toBe(emptyState)
    expect(screen.queryByRole('heading', { name: 'All places 0' })).toBeNull()
  })

  it('requires confirmation before resetting malformed saved data', async () => {
    const user = userEvent.setup()
    const onResetUnreadableData = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    const recoveryResult: PersonalWaypointStoreReadResult = {
      kind: 'recovery-required',
      reason: 'malformed-data',
      revision: '{broken' as NonNullable<typeof readyResult.revision>,
    }
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={recoveryResult}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={onResetUnreadableData}
        onDiscardRejectedRecords={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Reset saved waypoint data' }))
    expect(confirm).toHaveBeenCalledWith(
      'Reset the unreadable Personal Waypoints data? This removes only the Personal Waypoints storage key.',
    )
    expect(onResetUnreadableData).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Reset saved waypoint data' }))
    expect(onResetUnreadableData).toHaveBeenCalledOnce()
  })

  it('confirms discarding rejected records while keeping readable waypoints', async () => {
    const user = userEvent.setup()
    const onDiscardRejectedRecords = vi.fn()
    const confirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointsHome
        {...waypointHomeCallbacks}
        readResult={{
          ...readyResult,
          rejectedRecords: { count: 2, issues: [] },
        }}
        status={null}
        onAdd={() => undefined}
        editing={false}
        onSelectWaypoint={() => undefined}
        onRemove={() => undefined}
        onMove={() => undefined}
        onClearAll={() => undefined}
        onResetUnreadableData={() => undefined}
        onDiscardRejectedRecords={onDiscardRejectedRecords}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Discard unreadable records' }))
    expect(confirm).toHaveBeenCalledWith(
      'Discard 2 unreadable waypoint records and keep the readable Personal Waypoints?',
    )
    expect(onDiscardRejectedRecords).toHaveBeenCalledOnce()
  })
})

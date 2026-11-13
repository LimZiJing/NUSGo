// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalWaypointListActions } from './personal-waypoint-list-actions'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PersonalWaypointListActions', () => {
  it('shows Edit list and Clear all as plain commands with no overflow menu', async () => {
    const user = userEvent.setup()
    const onToggleEditing = vi.fn()
    render(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter={false}
        onToggleEditing={onToggleEditing}
        onClearAll={() => undefined}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Waypoint list options' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Edit list' }))
    expect(onToggleEditing).toHaveBeenCalledOnce()
  })

  it('swaps Edit list for Done while editing', () => {
    render(
      <PersonalWaypointListActions
        editing
        hasSearchFilter={false}
        onToggleEditing={() => undefined}
        onClearAll={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull()
  })

  it('confirms Clear all and disables it while search is active', async () => {
    const user = userEvent.setup()
    const onClearAll = vi.fn()
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    const view = render(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter
        onToggleEditing={() => undefined}
        onClearAll={onClearAll}
      />,
    )

    expect((screen.getByRole('button', { name: 'Clear all' }) as HTMLButtonElement).disabled).toBe(true)

    view.rerender(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter={false}
        onToggleEditing={() => undefined}
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

  it('does not confirm or clear while search is active', async () => {
    const user = userEvent.setup()
    const onClearAll = vi.fn()
    const confirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', confirm)
    render(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter
        onToggleEditing={() => undefined}
        onClearAll={onClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onClearAll).not.toHaveBeenCalled()
  })
})

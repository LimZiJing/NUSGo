// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalWaypointListActions } from './personal-waypoint-list-actions'

afterEach(cleanup)

describe('PersonalWaypointListActions', () => {
  it('keeps list editing and Clear all in the overflow menu', async () => {
    const user = userEvent.setup()
    const onToggleEditing = vi.fn()
    const onClearAll = vi.fn()
    render(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter={false}
        onToggleEditing={onToggleEditing}
        onClearAll={onClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Waypoint list options' }))
    await user.click(screen.getByRole('button', { name: 'Edit list' }))

    expect(onToggleEditing).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
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

    await user.click(screen.getByRole('button', { name: 'Waypoint list options' }))
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
    await user.click(screen.getByRole('button', { name: 'Waypoint list options' }))
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalWaypointListActions } from './personal-waypoint-list-actions'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Opens the collection's single overflow menu, or reuses it when it is already open. */
async function openListMenu(user: ReturnType<typeof userEvent.setup>) {
  const existing = screen.queryByRole('group', { name: 'Waypoint list commands' })
  if (existing) return existing
  await user.click(screen.getByRole('button', { name: 'Waypoint list options' }))
  return screen.getByRole('group', { name: 'Waypoint list commands' })
}

describe('PersonalWaypointListActions', () => {
  it('offers Edit list and Clear all behind the one overflow menu', async () => {
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

    // Exactly one trigger, and the commands are inside the popup rather than beside it.
    expect(document.querySelectorAll('.overflow-menu-trigger')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()

    const menu = await openListMenu(user)
    expect(within(menu).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['Edit list', 'Clear all'])

    await user.click(within(menu).getByRole('button', { name: 'Edit list' }))
    expect(onToggleEditing).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group', { name: 'Waypoint list commands' })).toBeNull()
  })

  it('offers no way to finish an edit while editing, and keeps Clear all', async () => {
    const user = userEvent.setup()
    render(
      <PersonalWaypointListActions
        editing
        hasSearchFilter={false}
        onToggleEditing={() => undefined}
        onClearAll={() => undefined}
      />,
    )

    // Confirm and Cancel are visible commands on the screen, so the menu carries neither them nor
    // an Edit list entry that would start a second edit. Clear all is not a way to end an edit, so
    // removing it would take a command away.
    const menu = await openListMenu(user)
    expect(within(menu).getAllByRole('button').map((button) => button.textContent)).toEqual(['Clear all'])
    expect(within(menu).queryByRole('button', { name: 'Done' })).toBeNull()
    expect(within(menu).queryByRole('button', { name: 'Edit list' })).toBeNull()
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

    const searchMenu = await openListMenu(user)
    expect((within(searchMenu).getByRole('button', { name: 'Clear all' }) as HTMLButtonElement).disabled)
      .toBe(true)

    view.rerender(
      <PersonalWaypointListActions
        editing={false}
        hasSearchFilter={false}
        onToggleEditing={() => undefined}
        onClearAll={onClearAll}
      />,
    )
    const menu = await openListMenu(user)
    await user.click(within(menu).getByRole('button', { name: 'Clear all' }))
    expect(confirm).toHaveBeenCalledWith(
      'Clear all personal waypoints, including places hidden by filters?',
    )
    expect(onClearAll).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    // Choosing a command closes the menu, so the second attempt reopens it.
    await user.click(within(await openListMenu(user)).getByRole('button', { name: 'Clear all' }))
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

    const menu = await openListMenu(user)
    await user.click(within(menu).getByRole('button', { name: 'Clear all' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onClearAll).not.toHaveBeenCalled()
  })
})

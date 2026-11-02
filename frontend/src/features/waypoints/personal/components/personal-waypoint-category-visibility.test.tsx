// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypointCategoryOption } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import { PersonalWaypointCategoryVisibility } from './personal-waypoint-category-visibility'

const categories: readonly PersonalWaypointCategoryOption[] = [
  { category: 'Food & drink', waypointCount: 2 },
  { category: 'Rest spot', waypointCount: 1 },
  { category: 'Study', waypointCount: 3 },
]

afterEach(cleanup)

describe('PersonalWaypointCategoryVisibility', () => {
  it('separates category navigation from map visibility checkboxes', async () => {
    const user = userEvent.setup()
    const onOpenCategory = vi.fn()
    const onSetCategoryVisible = vi.fn()
    render(
      <PersonalWaypointCategoryVisibility
        categories={categories}
        hiddenCategories={['Study']}
        draftHiddenCategories={['Study']}
        pickerOpen
        onTogglePicker={() => undefined}
        onSetCategoryVisible={onSetCategoryVisible}
        onOpenCategory={onOpenCategory}
        onClear={() => undefined}
        onCancel={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Selected' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'All categories' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Food & drink, 2 places' })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Show Study markers' }) as HTMLInputElement).checked).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Open Food & drink, 2 places' }))
    expect(onOpenCategory).toHaveBeenCalledWith('Food & drink')
    expect(onSetCategoryVisible).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: 'Show Rest spot markers' }))
    expect(onSetCategoryVisible).toHaveBeenCalledWith('Rest spot', false)
    expect(onOpenCategory).toHaveBeenCalledOnce()
  })

  it('filters category names and exposes Clear, Cancel, and Done visibility actions', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const onCancel = vi.fn()
    const onDone = vi.fn()
    render(
      <PersonalWaypointCategoryVisibility
        categories={categories}
        hiddenCategories={['Study']}
        draftHiddenCategories={['Study']}
        pickerOpen
        onTogglePicker={() => undefined}
        onSetCategoryVisible={() => undefined}
        onOpenCategory={() => undefined}
        onClear={onClear}
        onCancel={onCancel}
        onDone={onDone}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search categories' }), 'study')
    expect(screen.getByRole('button', { name: 'Open Study, 3 places' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Food & drink, 2 places' })).toBeNull()

    await user.clear(screen.getByRole('searchbox', { name: 'Search categories' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Done (2)' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })
})

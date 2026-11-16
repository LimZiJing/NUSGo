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
  it('renders each category as a label with only a map visibility toggle', async () => {
    const user = userEvent.setup()
    const onSetCategoryVisible = vi.fn()
    render(
      <PersonalWaypointCategoryVisibility
        categories={categories}
        hiddenCategories={['Study']}
        draftHiddenCategories={['Study']}
        pickerOpen
        onTogglePicker={() => undefined}
        onSetCategoryVisible={onSetCategoryVisible}
        onClear={() => undefined}
        onCancel={() => undefined}
        onDone={() => undefined}
      />,
    )

    // One alphabetical list, with no "Selected" / "All categories" split: a checkbox must not
    // move the row it belongs to when it is ticked.
    expect(screen.queryByRole('heading', { name: 'Selected' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'All categories' })).toBeNull()
    const rowOrder = [...document.querySelectorAll('.personal-waypoint-category-name')]
      .map((element) => element.textContent)
    expect(rowOrder).toEqual(['Food & drink', 'Rest spot', 'Study'])
    // The row is text, not a control: there is no category screen left to open.
    expect(screen.getByText('Food & drink')).toBeTruthy()
    expect(screen.getByText('2 places')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open Food & drink/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Open / })).toBeNull()

    // Visibility is membership, so each row carries a checkbox named after its category. A hidden
    // category is simply unchecked; the ✕ that used to appear here reads as "delete" elsewhere in
    // this screen, so no row borrows that icon for a map preference.
    const studyCheck = screen.getByRole('checkbox', { name: 'Show Study on the map' })
    expect((studyCheck as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'Show Food & drink on the map' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Show Rest spot on the map' })).toBeTruthy()
    expect(document.querySelector('.personal-waypoint-category-toggle')).toBeNull()

    // The rows carry no action buttons at all: the checkbox is the whole control.
    const categoryRows = document.querySelectorAll('.personal-waypoint-category-option')
    expect(categoryRows).toHaveLength(3)
    for (const row of categoryRows) {
      expect(row.querySelectorAll('button')).toHaveLength(0)
      expect(row.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
    }

    await user.click(studyCheck)
    expect(onSetCategoryVisible).toHaveBeenCalledWith('Study', true)
    expect(onSetCategoryVisible).toHaveBeenCalledOnce()
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
        onClear={onClear}
        onCancel={onCancel}
        onDone={onDone}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search categories' }), 'study')
    expect(screen.getByRole('checkbox', { name: 'Show Study on the map' })).toBeTruthy()
    expect(screen.getByText('Study')).toBeTruthy()
    expect(screen.queryByText('Food & drink')).toBeNull()

    await user.clear(screen.getByRole('searchbox', { name: 'Search categories' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    // Nothing is staged in this render (draft equals committed), so Done promises no change and
    // says so plainly. It used to read "Done (2)", the number of categories shown, which never
    // changes with the draft and so counted the wrong thing.
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('counts the pending changes on Done rather than the categories shown', () => {
    const { rerender } = render(
      <PersonalWaypointCategoryVisibility
        categories={categories}
        hiddenCategories={[]}
        draftHiddenCategories={[]}
        pickerOpen
        onTogglePicker={() => undefined}
        onSetCategoryVisible={() => undefined}
        onClear={() => undefined}
        onCancel={() => undefined}
        onDone={() => undefined}
      />,
    )

    // Draft matches what is saved, so there is nothing to apply.
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()

    // Two categories staged as hidden: Done says how many changes it will apply.
    rerender(
      <PersonalWaypointCategoryVisibility
        categories={categories}
        hiddenCategories={[]}
        draftHiddenCategories={['Study', 'Rest spot']}
        pickerOpen
        onTogglePicker={() => undefined}
        onSetCategoryVisible={() => undefined}
        onClear={() => undefined}
        onCancel={() => undefined}
        onDone={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Done (2)' })).toBeTruthy()
  })
})

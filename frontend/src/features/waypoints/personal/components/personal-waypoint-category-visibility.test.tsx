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

    expect(screen.getByRole('heading', { name: 'Selected' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'All categories' })).toBeTruthy()
    // The row is text, not a control: there is no category screen left to open.
    expect(screen.getByText('Food & drink')).toBeTruthy()
    expect(screen.getByText('2 places')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open Food & drink/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Open / })).toBeNull()

    // A hidden category still has a visibility control, and it is a toggle button, not a row action.
    const studyToggle = screen.getByRole('button', { name: 'Show Study markers' })
    expect(studyToggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Show Food & drink markers' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.queryByRole('checkbox')).toBeNull()

    // The only buttons inside the category rows are the visibility toggles.
    const categoryRows = document.querySelectorAll('.personal-waypoint-category-option')
    expect(categoryRows).toHaveLength(3)
    for (const row of categoryRows) {
      const buttons = [...row.querySelectorAll('button')]
      expect(buttons).toHaveLength(1)
      expect(buttons[0].getAttribute('aria-label')).toMatch(/^Show .+ markers$/)
    }

    await user.click(screen.getByRole('button', { name: 'Show Rest spot markers' }))
    expect(onSetCategoryVisible).toHaveBeenCalledWith('Rest spot', false)
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
    expect(screen.getByRole('button', { name: 'Show Study markers' })).toBeTruthy()
    expect(screen.getByText('Study')).toBeTruthy()
    expect(screen.queryByText('Food & drink')).toBeNull()

    await user.clear(screen.getByRole('searchbox', { name: 'Search categories' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Done (2)' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledOnce()
  })
})

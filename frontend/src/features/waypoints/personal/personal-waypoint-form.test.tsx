// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypointDraft } from '../../../domain/waypoints/personal/create-personal-waypoint'
import { PersonalWaypointForm } from './personal-waypoint-form'

const draft: PersonalWaypointDraft = {
  name: 'Quiet bench',
  category: 'Rest spot',
  note: '',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
}

function StatefulPersonalWaypointForm({ onChange }: { readonly onChange: (changes: Partial<PersonalWaypointDraft>) => void }) {
  const [currentDraft, setCurrentDraft] = useState(draft)
  return <PersonalWaypointForm
    draft={currentDraft}
    categoryOptions={[
      { category: 'Study', waypointCount: 1 },
      { category: 'Cafe', waypointCount: 2 },
      { category: 'Rest spot', waypointCount: 1 },
      { category: 'Cafe', waypointCount: 2 },
    ]}
    issues={[]}
    status={null}
    onChange={(changes) => {
      onChange(changes)
      setCurrentDraft((current) => ({ ...current, ...changes }))
    }}
    onAdjustLocation={() => undefined}
    onSave={() => undefined}
  />
}

afterEach(cleanup)

describe('PersonalWaypointForm', () => {
  it('opens saved categories for touch selection and still accepts a new category', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)

    const categoryInput = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.click(screen.getByRole('button', { name: 'Show category options' }))
    expect(await screen.findByRole('option', { name: 'Cafe' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Study' })).toBeTruthy()

    await user.click(screen.getByRole('option', { name: 'Cafe' }))
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Cafe' })

    // Typing only narrows the list: it never commits the draft category on its own.
    await user.clear(categoryInput)
    await user.click(categoryInput)
    await user.type(categoryInput, 'New category')
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Cafe' })

    // The new name is accepted only through the explicit Create result.
    await user.click(await screen.findByRole('button', { name: 'Create “New category”' }))
    expect(onChange).toHaveBeenLastCalledWith({ category: 'New category' })
  })

  it('shows the current category, then empties the field when opened for searching', async () => {
    const user = userEvent.setup()
    render(<StatefulPersonalWaypointForm onChange={() => undefined} />)

    const categoryInput = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    // Closed, the field is the display of the chosen category: no redundant caption repeats it.
    expect(categoryInput.value).toBe('Rest spot')
    expect(document.querySelector('.connected-category-picker-current')).toBeNull()

    // Opened, it becomes an empty search box so a new name starts from nothing.
    await user.click(categoryInput)
    expect(categoryInput.value).toBe('')
    expect(categoryInput.placeholder).toBe('Search or create a category')
    expect(await screen.findByRole('option', { name: 'Cafe' })).toBeTruthy()

    // Closing without choosing restores the category that is actually set.
    await user.keyboard('{Escape}')
    expect(categoryInput.value).toBe('Rest spot')
  })
})

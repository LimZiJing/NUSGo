// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypointDraft } from '../../../domain/waypoints/personal/create-personal-waypoint'
import { PersonalWaypointForm } from './personal-waypoint-form'
import { ConnectedCategoryPicker } from './connected-category-picker'

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
    onCancel={() => undefined}
    onSave={() => undefined}
  />
}

afterEach(cleanup)

describe('PersonalWaypointForm', () => {
  it('exposes the draft category as selected while keyboard focus moves independently', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)
    const category = screen.getByRole('combobox', { name: 'Category' })
    await user.click(category)
    const current = screen.getByRole('option', { name: 'Rest spot' })
    const cafe = screen.getByRole('option', { name: 'Cafe' })
    expect(current.getAttribute('aria-selected')).toBe('true')
    expect(cafe.getAttribute('aria-selected')).toBe('false')
    expect(category.getAttribute('aria-activedescendant')).toBe(cafe.id)
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(category.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Study' }).id)
    expect(current.getAttribute('aria-selected')).toBe('true')
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Study' })
    await user.click(category)
    expect(screen.getByRole('option', { name: 'Study' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Rest spot' }).getAttribute('aria-selected')).toBe('false')
  })

  it('shows the draft coordinate while Location is collapsed', () => {
    render(<StatefulPersonalWaypointForm onChange={vi.fn()} />)
    const coordinate = screen.getByText('1.290000, 103.780000')
    expect(coordinate.closest('summary')).not.toBeNull()
    expect(coordinate.closest('details')?.open).toBe(false)
  })

  it('abandons search with Escape after Tab moves focus to the category trigger', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)
    const category = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.clear(category)
    await user.type(category, 'Abandon me')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show category options' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(category.value).toBe('Rest spot')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps keyboard choice valid when available categories change while open', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const { rerender } = render(<ConnectedCategoryPicker id="category-test" category="" options={['Cafe', 'Rest', 'Study']} onSelect={onSelect} />)
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.keyboard('{ArrowDown}{ArrowDown}')
    rerender(<ConnectedCategoryPicker id="category-test" category="" options={['Cafe']} onSelect={onSelect} />)
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('Cafe')
  })

  it('commits an existing category only on choice and keeps typed categories as draft until Create', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)

    const categoryInput = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.click(screen.getByRole('button', { name: 'Show category options' }))
    expect(await screen.findByRole('option', { name: 'Cafe' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Study' })).toBeTruthy()

    await user.click(screen.getByRole('option', { name: 'Cafe' }))
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Cafe' })

    await user.clear(categoryInput)
    await user.type(categoryInput, 'New category')
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Cafe' })
    await user.click(await screen.findByRole('option', { name: 'Create “New category”' }))
    expect(onChange).toHaveBeenLastCalledWith({ category: 'New category' })
  })

  it('commits the highlighted Create result with Enter and abandons a later search with Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)
    const categoryInput = screen.getByRole('combobox', { name: 'Category' })
    await user.clear(categoryInput)
    await user.type(categoryInput, 'Quiet corner')
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Quiet corner' })

    await user.clear(categoryInput)
    await user.type(categoryInput, 'discard me')
    await user.keyboard('{Escape}')
    expect((categoryInput as HTMLInputElement).value).toBe('Quiet corner')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('abandons category search on outside press and blur without changing the draft', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulPersonalWaypointForm onChange={onChange} />)
    const categoryInput = screen.getByRole('combobox', { name: 'Category' }) as HTMLInputElement
    await user.clear(categoryInput)
    await user.type(categoryInput, 'uncommitted')
    await user.click(screen.getByLabelText('Name'))
    expect(categoryInput.value).toBe('Rest spot')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.click(categoryInput)
    await user.clear(categoryInput)
    await user.type(categoryInput, 'outside search')
    await user.click(screen.getByLabelText('Note (optional)'))
    expect(categoryInput.value).toBe('Rest spot')
    expect(onChange).not.toHaveBeenCalled()
  })
})

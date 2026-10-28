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
    onCancel={() => undefined}
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
    await user.click(screen.getByRole('button', { name: 'Show categories' }))
    expect(await screen.findByRole('option', { name: 'Cafe' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Study' })).toBeTruthy()

    await user.click(screen.getByRole('option', { name: 'Cafe' }))
    expect(onChange).toHaveBeenLastCalledWith({ category: 'Cafe' })

    await user.clear(categoryInput)
    await user.type(categoryInput, 'New category')
    expect(onChange).toHaveBeenLastCalledWith({ category: 'New category' })
  })
})

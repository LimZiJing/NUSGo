// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypointDraft } from '../../../../domain/waypoints/personal/create-personal-waypoint'
import { PersonalWaypointAppearanceFields } from './personal-waypoint-appearance-fields'

const draft: PersonalWaypointDraft = {
  name: 'Quiet bench',
  category: 'Food & drink',
  note: '',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  markerColor: 'blue',
  markerIcon: 'dot',
}

afterEach(cleanup)

function StatefulAppearanceFields({ onChange }: {
  readonly onChange: (changes: Partial<PersonalWaypointDraft>) => void
}) {
  const [currentDraft, setCurrentDraft] = useState(draft)
  return <PersonalWaypointAppearanceFields
    draft={currentDraft}
    onChange={(changes) => {
      onChange(changes)
      setCurrentDraft((current) => ({ ...current, ...changes }))
    }}
  />
}

describe('PersonalWaypointAppearanceFields', () => {
  it('shows a collapsed marker style row with the saved preview', async () => {
    const user = userEvent.setup()
    render(<PersonalWaypointAppearanceFields draft={draft} onChange={vi.fn()} />)

    const markerStyleButton = screen.getByRole('button', { name: /Marker style/ })
    expect(markerStyleButton.getAttribute('aria-expanded')).toBe('false')
    expect(markerStyleButton.getAttribute('aria-label')).toBe('Marker style, Blue marker, General icon')
    expect(screen.queryByRole('radio')).toBeNull()

    await user.keyboard('{Tab}')
    expect(document.activeElement).toBe(markerStyleButton)
    await user.keyboard('{Enter}')

    expect(markerStyleButton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'General' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Colour' })).toBeTruthy()
  })

  it('reports colour and icon selections and updates the preview', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatefulAppearanceFields onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Marker style/ }))
    expect((screen.getByRole('radio', { name: 'Blue' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'General' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByRole('radio')).toHaveLength(13)
    expect(screen.queryByText('Blue')).toBeNull()
    expect(screen.queryByText('Red')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Purple' }))
    expect(screen.getByRole('button', { name: /Marker style/ }).getAttribute('aria-label')).toBe('Marker style, Purple marker, General icon')
    await user.click(screen.getByRole('radio', { name: 'Rest' }))

    expect(onChange).toHaveBeenNthCalledWith(1, { markerColor: 'purple' })
    expect(onChange).toHaveBeenNthCalledWith(2, { markerIcon: 'rest' })
    expect(screen.getByRole('button', { name: /Marker style/ }).getAttribute('aria-label')).toBe('Marker style, Purple marker, Rest icon')

    await user.click(screen.getByRole('button', { name: /Marker style/ }))
    expect(screen.queryByRole('radio')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Marker style/ }))
    expect((screen.getByRole('radio', { name: 'Purple' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Rest' }) as HTMLInputElement).checked).toBe(true)
  })
})

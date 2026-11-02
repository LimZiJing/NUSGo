// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('PersonalWaypointAppearanceFields', () => {
  it('shows the stored choices and reports explicit color and icon selections', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PersonalWaypointAppearanceFields draft={draft} onChange={onChange} />)

    expect((screen.getByRole('radio', { name: 'Blue' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'General' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByRole('radio')).toHaveLength(13)
    expect(screen.queryByText('Blue')).toBeNull()
    expect(screen.queryByText('Red')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Purple' }))
    await user.click(screen.getByRole('radio', { name: 'Rest' }))

    expect(onChange).toHaveBeenNthCalledWith(1, { markerColor: 'purple' })
    expect(onChange).toHaveBeenNthCalledWith(2, { markerIcon: 'rest' })
  })
})

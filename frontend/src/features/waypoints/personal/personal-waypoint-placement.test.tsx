// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { PersonalWaypointPlacement } from './personal-waypoint-placement'

afterEach(cleanup)

describe('PersonalWaypointPlacement', () => {
  it('provides a simple map adjustment mode without coordinate entry', async () => {
    const user = userEvent.setup()
    const coordinate: WaypointCoordinate = { longitude: 103.7844, latitude: 1.2933 }
    const onContinue = vi.fn()
    const onCancel = vi.fn()
    render(
      <PersonalWaypointPlacement
        coordinate={coordinate}
        onContinue={onContinue}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Adjust waypoint location' })).toBeTruthy()
    expect(screen.getByText('Tap the map or use its centre to move the pin, then return to your form.')).toBeTruthy()
    expect(screen.getByText('1.293300° N · 103.784400° E')).toBeTruthy()
    expect(screen.queryByRole('spinbutton', { name: 'Latitude' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Longitude' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Done adjusting location' }))
    expect(onContinue).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

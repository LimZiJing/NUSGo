// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { PersonalWaypointPlacement } from './personal-waypoint-placement'

afterEach(cleanup)

describe('PersonalWaypointPlacement', () => {
  it('restores the unchanged map centre into typed coordinate fields', async () => {
    const user = userEvent.setup()
    const center: WaypointCoordinate = { longitude: 103.7844, latitude: 1.2933 }
    const onChange = vi.fn()
    render(
      <PersonalWaypointPlacement
        coordinate={center}
        mapCenter={center}
        onChange={onChange}
        onContinue={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const latitude = screen.getByRole('spinbutton', { name: 'Latitude' }) as HTMLInputElement
    const longitude = screen.getByRole('spinbutton', { name: 'Longitude' }) as HTMLInputElement
    await user.clear(latitude)
    await user.type(latitude, '91')
    await user.clear(longitude)
    await user.type(longitude, '104')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('alert').textContent).toContain('valid latitude and longitude')

    await user.click(screen.getByRole('button', { name: 'Use map centre' }))

    expect(latitude.value).toBe(String(center.latitude))
    expect(longitude.value).toBe(String(center.longitude))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onChange).toHaveBeenCalledWith(center)
  })
})
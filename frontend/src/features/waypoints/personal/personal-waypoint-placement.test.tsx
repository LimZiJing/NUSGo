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

    const coordinateToggle = screen.getByRole('button', { name: 'Enter coordinates' })
    expect(coordinateToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('spinbutton', { name: 'Latitude' })).toBeNull()
    await user.click(coordinateToggle)

    const latitude = screen.getByRole('spinbutton', { name: 'Latitude' }) as HTMLInputElement
    const longitude = screen.getByRole('spinbutton', { name: 'Longitude' }) as HTMLInputElement
    await user.clear(latitude)
    await user.type(latitude, '91')
    await user.clear(longitude)
    await user.type(longitude, '104')
    await user.click(coordinateToggle)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(coordinateToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('alert').textContent).toContain('Latitude must be between')
    expect(latitude.getAttribute('aria-invalid')).toBe('true')
    expect(longitude.getAttribute('aria-invalid')).toBe('false')
    expect(document.activeElement).toBe(latitude)

    await user.click(screen.getByRole('button', { name: 'Use map centre' }))

    expect(Number(latitude.value)).toBe(center.latitude)
    expect(Number(longitude.value)).toBe(center.longitude)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(latitude.getAttribute('aria-invalid')).toBe('false')
    expect(onChange).toHaveBeenCalledWith(center)
  })
})

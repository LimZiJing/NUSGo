// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocationTrackingState } from '../domain/location/types'
import { LocationControl } from './location-control'

afterEach(cleanup)

const trackingState: LocationTrackingState = {
  status: 'tracking',
  latestFix: {
    longitude: 103.7844,
    latitude: 1.2933,
    accuracy: 12,
    timestamp: 1_000,
  },
}

function renderControl(
  location: LocationTrackingState,
  markerVisible = true,
  overrides: Partial<React.ComponentProps<typeof LocationControl>> = {},
) {
  return render(
    <LocationControl
      location={location}
      markerVisible={markerVisible}
      topOffset={76}
      onEnable={vi.fn()}
      onDisable={vi.fn()}
      onHideMarker={vi.fn()}
      onShowMarker={vi.fn()}
      {...overrides}
    />,
  )
}

describe('LocationControl', () => {
  it('offers location tracking when it is disabled', async () => {
    const user = userEvent.setup()
    const onEnable = vi.fn()
    renderControl({ status: 'disabled', latestFix: null }, true, { onEnable })

    await user.click(screen.getByRole('button', { name: 'Location' }))

    expect(screen.getByRole('status').textContent).toBe('Location sharing is off')
    await user.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('shows the active location actions and latest accuracy', async () => {
    const user = userEvent.setup()
    const onDisable = vi.fn()
    const onHideMarker = vi.fn()
    renderControl(trackingState, true, { onDisable, onHideMarker })

    await user.click(screen.getByRole('button', { name: 'Location' }))

    expect(screen.getByRole('status').textContent).toBe('Location tracking is on')
    expect(screen.getByText('Accuracy: ±12 m')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Hide location marker' }))
    await user.click(screen.getByRole('button', { name: 'Stop location tracking' }))
    expect(onHideMarker).toHaveBeenCalledOnce()
    expect(onDisable).toHaveBeenCalledOnce()
  })

  it('shows a retry action for location errors', async () => {
    const user = userEvent.setup()
    const onEnable = vi.fn()
    renderControl({ status: 'denied', latestFix: null }, true, { onEnable })

    await user.click(screen.getByRole('button', { name: 'Location' }))

    expect(screen.getByRole('status').textContent).toBe(
      'Location permission was denied. Allow it in your browser settings, then try again.',
    )
    await user.click(screen.getByRole('button', { name: 'Try location again' }))
    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('offers to show a hidden marker while tracking continues', async () => {
    const user = userEvent.setup()
    const onShowMarker = vi.fn()
    renderControl(trackingState, false, { onShowMarker })

    await user.click(screen.getByRole('button', { name: 'Location' }))
    await user.click(screen.getByRole('button', { name: 'Show location marker' }))

    expect(onShowMarker).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Show location marker' })).toBeTruthy()
  })
})

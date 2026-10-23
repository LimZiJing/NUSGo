// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationPrivacySection } from './location-privacy-section'

afterEach(cleanup)

describe('Location and privacy settings', () => {
  it('shows permission status and clears only the active location state on request', async () => {
    const user = userEvent.setup()
    const onClearLocation = vi.fn()
    render(
      <LocationPrivacySection
        permissionStatus="denied"
        hasLocationActivity
        onClearLocation={onClearLocation}
      />,
    )

    expect(screen.getByText('Denied')).toBeTruthy()
    expect(screen.getByText(
      'Live location stays on this device; routes use saved coordinates.',
    )).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Clear location' }))

    expect(onClearLocation).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent)
      .toBe('Location cleared. Permission and trip endpoints are unchanged.')
  })

  it('disables clearing when no active or in-memory fix exists', () => {
    render(
      <LocationPrivacySection
        permissionStatus="unavailable"
        hasLocationActivity={false}
        onClearLocation={vi.fn()}
      />,
    )

    expect((screen.getByRole('button', { name: 'Clear location' }) as HTMLButtonElement).disabled)
      .toBe(true)
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })
})

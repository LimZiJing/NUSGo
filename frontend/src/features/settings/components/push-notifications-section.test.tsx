// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PushNotificationsSection } from './push-notifications-section'

afterEach(cleanup)

const defaults = {
  availability: 'available' as const,
  permission: 'default' as const,
  enabled: false,
  busy: false,
  errorMessage: '',
  onEnable: () => undefined,
  onDisable: () => undefined,
}

describe('PushNotificationsSection', () => {
  it('explains what notifications do before offering the button', () => {
    render(<PushNotificationsSection {...defaults} />)

    expect(screen.getByText(/only asks for permission after you tap Enable/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Enable notifications/ })).toBeTruthy()
  })

  it('turns notifications off when already enabled', async () => {
    const user = userEvent.setup()
    const onDisable = vi.fn()
    render(
      <PushNotificationsSection {...defaults} permission="granted" enabled onDisable={onDisable} />,
    )

    await user.click(screen.getByRole('button', { name: /Turn off notifications/ }))

    expect(onDisable).toHaveBeenCalledOnce()
  })

  it('explains the Home Screen requirement on iOS instead of offering a button', () => {
    render(<PushNotificationsSection {...defaults} availability="needs-home-screen" />)

    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sends people to browser settings when permission was denied', () => {
    render(<PushNotificationsSection {...defaults} permission="denied" />)

    expect(screen.getByText(/blocked for NUSGo in your browser settings/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('announces a failure without hiding the explanation', () => {
    render(<PushNotificationsSection {...defaults} errorMessage="Notifications could not be changed. Try again." />)

    expect(screen.getByRole('alert').textContent).toBe('Notifications could not be changed. Try again.')
    expect(screen.getByText(/NUSGo only asks for permission/)).toBeTruthy()
  })
})

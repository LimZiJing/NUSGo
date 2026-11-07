// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReminderState } from '../../../domain/push/push-notifications'
import { AlightReminderControl } from './alight-reminder-control'

afterEach(cleanup)

const routes = [
  { routeId: 'A1', routeName: 'A1' },
  { routeId: 'D1', routeName: 'D1' },
]

function reminderState(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    availability: 'available',
    permission: 'default',
    watchedRouteId: null,
    busy: false,
    errorMessage: '',
    enable: vi.fn(),
    disable: vi.fn(),
    ...overrides,
  }
}

function renderControl(reminder: ReminderState = reminderState()) {
  return render(
    <AlightReminderControl
      stopId="COM3"
      stopName="COM3 Opp"
      routes={routes}
      reminder={reminder}
    />,
  )
}

describe('AlightReminderControl', () => {
  it('explains what the reminder does before offering the button', () => {
    renderControl()

    const description = screen.getByText(/about to reach COM3 Opp/)
    expect(description.textContent).toMatch(/only asks for permission after you tap Remind me/)
    expect(screen.getByRole('button', { name: /Remind me/ }).getAttribute('aria-describedby'))
      .toBe(description.id)
  })

  it('asks for the route the rider picked', async () => {
    const user = userEvent.setup()
    const enable = vi.fn()
    renderControl(reminderState({ enable }))

    await user.click(screen.getByRole('button', { name: 'Route to watch A1' }))
    await user.click(screen.getByRole('option', { name: 'D1' }))
    await user.click(screen.getByRole('button', { name: /Remind me/ }))

    expect(enable).toHaveBeenCalledWith('D1')
  })

  it('offers no route choice for a stop with a single route', () => {
    render(
      <AlightReminderControl
        stopId="COM3"
        stopName="COM3 Opp"
        routes={[{ routeId: 'D1', routeName: 'D1' }]}
        reminder={reminderState()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Route to watch D1' })).toBeNull()
  })

  it('turns a watched reminder off instead of asking again', async () => {
    const user = userEvent.setup()
    const disable = vi.fn()
    renderControl(reminderState({ permission: 'granted', watchedRouteId: 'D1', disable }))

    expect(screen.getByText(/notify you once when bus D1/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Stop reminding me/ }))

    expect(disable).toHaveBeenCalledOnce()
  })

  it('still lets a rider cancel a watch whose route is no longer listed', async () => {
    const user = userEvent.setup()
    const disable = vi.fn()
    renderControl(reminderState({ permission: 'granted', watchedRouteId: 'Z9', disable }))

    expect(screen.getByText(/notify you once when bus Z9/)).toBeTruthy()
    // The route picker retires with the watch: the only action left is turning it off.
    expect(screen.queryByRole('button', { name: /Route to watch/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Stop reminding me/ }))

    expect(disable).toHaveBeenCalledOnce()
  })

  it('explains the Home Screen requirement on iOS instead of offering a button', () => {
    renderControl(reminderState({ availability: 'needs-home-screen' }))

    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sends people to browser settings when permission was denied', () => {
    renderControl(reminderState({ permission: 'denied' }))

    expect(screen.getByText(/blocked for NUSGo in your browser settings/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Remind me/ })).toBeNull()
  })

  it('reports a failed change without hiding the explanation', () => {
    renderControl(reminderState({ errorMessage: 'The reminder could not be changed. Try again.' }))

    expect(screen.getByRole('alert').textContent).toBe('The reminder could not be changed. Try again.')
    expect(screen.getByText(/about to reach COM3 Opp/)).toBeTruthy()
  })
})

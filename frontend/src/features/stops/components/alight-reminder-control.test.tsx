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
    watchedLeadTimeSeconds: null,
    watchedExpiresAt: null,
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

    const description = screen.getByText(/before the next bus on the chosen route is due at COM3 Opp/)
    expect(description.textContent).toMatch(/only asks for permission after you tap Remind me/)
    expect(screen.getByRole('button', { name: /Remind me/ }).getAttribute('aria-describedby'))
      .toBe(description.id)
  })

  it('says the timing is an approximate live ETA, not a timetable', () => {
    renderControl()

    expect(screen.getByText(/approximate live estimates, not a timetable/)).toBeTruthy()
  })

  it('shows the two-minute default lead time before anything is enabled', () => {
    renderControl()

    // Both the explanation and the picker state the promise, so the rider never has to guess.
    expect(screen.getByText(/about 2 minutes before/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lead time 2 minutes' })).toBeTruthy()
  })

  it('asks for the route and lead time the rider picked', async () => {
    const user = userEvent.setup()
    const enable = vi.fn()
    renderControl(reminderState({ enable }))

    await user.click(screen.getByRole('button', { name: 'Route to watch A1' }))
    await user.click(screen.getByRole('option', { name: 'D1' }))
    await user.click(screen.getByRole('button', { name: 'Lead time 2 minutes' }))
    await user.click(screen.getByRole('option', { name: '3 minutes' }))
    await user.click(screen.getByRole('button', { name: /Remind me/ }))

    expect(enable).toHaveBeenCalledWith('D1', 180)
    // Choosing a lead time updates the promise the rider reads.
    expect(screen.getByText(/about 3 minutes before/)).toBeTruthy()
  })

  it('offers no route choice for a stop with a single route but still offers the lead time', () => {
    render(
      <AlightReminderControl
        stopId="COM3"
        stopName="COM3 Opp"
        routes={[{ routeId: 'D1', routeName: 'D1' }]}
        reminder={reminderState()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Route to watch D1' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Lead time 2 minutes' })).toBeTruthy()
  })

  it('turns a watched reminder off and states the lead time and expiry it will use', async () => {
    const user = userEvent.setup()
    const disable = vi.fn()
    renderControl(reminderState({
      permission: 'granted',
      watchedRouteId: 'D1',
      watchedLeadTimeSeconds: 60,
      watchedExpiresAt: '2026-11-06T12:05:00.000Z',
      disable,
    }))

    const description = screen.getByText(/notify you once, about 1 minute before bus D1/)
    expect(description.textContent).toMatch(/live estimates and can be approximate/)
    expect(description.textContent).toMatch(/It lapses by/)
    // An existing watch is only ever cancelled, so the choices retire with it.
    expect(screen.queryByRole('button', { name: 'Lead time 1 minute' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Stop reminding me/ }))

    expect(disable).toHaveBeenCalledOnce()
  })

  it('still lets a rider cancel a watch whose route is no longer listed', async () => {
    const user = userEvent.setup()
    const disable = vi.fn()
    renderControl(reminderState({
      permission: 'granted',
      watchedRouteId: 'Z9',
      watchedLeadTimeSeconds: 120,
      disable,
    }))

    expect(screen.getByText(/notify you once, about 2 minutes before bus Z9/)).toBeTruthy()
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

  // The live region must exist, empty, before anything goes wrong; a conditionally mounted alert
  // is not announced by screen readers when it appears.
  it('keeps a silent empty alert region mounted from the first render', () => {
    renderControl()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('')
  })

  it('fills the same alert region when a change fails, without hiding the explanation', () => {
    const { rerender } = renderControl()

    rerender(
      <AlightReminderControl
        stopId="COM3"
        stopName="COM3 Opp"
        routes={routes}
        reminder={reminderState({ errorMessage: 'The reminder could not be changed. Try again.' })}
      />,
    )

    expect(screen.getByRole('alert').textContent).toBe('The reminder could not be changed. Try again.')
    expect(screen.getByText(/before the next bus on the chosen route/)).toBeTruthy()
  })
})

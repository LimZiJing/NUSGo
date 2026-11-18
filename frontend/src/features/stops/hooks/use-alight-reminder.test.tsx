// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  EnableReminderResult,
  PushNotificationService,
  ReminderPreference,
} from '../../../domain/push/push-notifications'
import { PUSH_PREFERENCE_CHANGED_EVENT } from '../../../domain/push/push-notifications'
import { useAlightReminder } from './use-alight-reminder'

afterEach(cleanup)

function service(overrides: Partial<PushNotificationService> = {}): PushNotificationService {
  return {
    getEnvironment: () => ({ availability: 'available', permission: 'default' }),
    readPreference: () => null,
    enable: async () => ({ preference: null, permission: 'denied' }),
    disable: async () => null,
    readReminder: () => null,
    enableReminder: async (): Promise<EnableReminderResult> => ({ preference: null, permission: 'granted' }),
    disableReminder: async () => null,
    ...overrides,
  }
}

function Probe({
  pushService,
  stopId = 'COM3',
  now,
}: {
  readonly pushService: PushNotificationService
  readonly stopId?: string | null
  readonly now?: () => number
}) {
  const reminder = useAlightReminder(pushService, stopId, now)
  return (
    <>
      <span data-testid="watched">{reminder.watchedRouteId ?? 'none'}</span>
      <span data-testid="lead">{String(reminder.watchedLeadTimeSeconds)}</span>
      <span data-testid="expires">{String(reminder.watchedExpiresAt)}</span>
      <span data-testid="permission">{reminder.permission}</span>
      <span data-testid="busy">{String(reminder.busy)}</span>
      <span data-testid="error">{reminder.errorMessage}</span>
      <button type="button" onClick={() => reminder.enable('D1', 120)}>enable</button>
      <button type="button" onClick={() => reminder.enable('D1', 60)}>enable one minute</button>
      <button type="button" onClick={reminder.disable}>disable</button>
    </>
  )
}

function state(testId: string): string | null {
  return screen.getByTestId(testId).textContent
}

// A watch the server has not expired; the clock is injected wherever the test is about expiry.
const SAVED: ReminderPreference = {
  stopId: 'COM3',
  routeId: 'D1',
  endpoint: 'https://push.example.test/sub/1',
  leadTimeSeconds: 120,
  expiresAt: '2030-01-01T12:00:00.000Z',
}

const AFTER_SAVED_EXPIRY = Date.parse('2030-01-01T12:00:00.000Z')

/** A browser that already lets NUSGo show notifications, which is what a saved reminder implies. */
function granted(overrides: Partial<PushNotificationService> = {}): PushNotificationService {
  return service({
    getEnvironment: () => ({ availability: 'available', permission: 'granted' }),
    ...overrides,
  })
}

describe('useAlightReminder', () => {

  it('refreshes a mounted control after shared subscription rotation changes its preference', () => {
    const readReminder = vi.fn<() => ReminderPreference | null>().mockReturnValue(SAVED)
    render(<Probe pushService={granted({ readReminder })} />)
    expect(state('watched')).toBe('D1')
    readReminder.mockReturnValue(null)
    act(() => window.dispatchEvent(new Event(PUSH_PREFERENCE_CHANGED_EVENT)))
    expect(state('watched')).toBe('none')
  })

  it('reports no watch for a stop nobody asked about', () => {
    render(<Probe pushService={granted({ readReminder: () => SAVED })} stopId="OTHER" />)

    expect(state('watched')).toBe('none')
  })

  it('reports the saved route, lead time and expiry only for the stop it names', () => {
    render(<Probe pushService={granted({ readReminder: () => SAVED })} />)

    expect(state('watched')).toBe('D1')
    expect(state('lead')).toBe('120')
    expect(state('expires')).toBe(SAVED.expiresAt)
  })

  it('does not claim a watch the browser no longer permits', () => {
    render(<Probe pushService={service({
      getEnvironment: () => ({ availability: 'available', permission: 'denied' }),
      readReminder: () => SAVED,
    })} />)

    expect(state('watched')).toBe('none')
    expect(state('permission')).toBe('denied')
  })

  // The server removes the watch at expiry, so the control must not offer to stop a reminder that
  // can never fire again.
  it('does not claim a saved watch past the server expiry', () => {
    render(
      <Probe
        pushService={granted({ readReminder: () => SAVED })}
        now={() => AFTER_SAVED_EXPIRY}
      />,
    )

    expect(state('watched')).toBe('none')
    expect(state('expires')).toBe('null')
  })

  it('keeps a saved watch one millisecond before its expiry', () => {
    render(
      <Probe
        pushService={granted({ readReminder: () => SAVED })}
        now={() => AFTER_SAVED_EXPIRY - 1}
      />,
    )

    expect(state('watched')).toBe('D1')
  })

  it('registers a watch from a tap with the chosen lead time and stores the result', async () => {
    const user = userEvent.setup()
    const saved: ReminderPreference = { ...SAVED, leadTimeSeconds: 60 }
    const enableReminder = vi.fn(async (): Promise<EnableReminderResult> => ({
      preference: saved,
      permission: 'granted',
    }))
    render(<Probe pushService={granted({ enableReminder })} />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'enable one minute' }))
    })

    expect(enableReminder).toHaveBeenCalledWith({ stopId: 'COM3', routeId: 'D1', leadTimeSeconds: 60 })
    expect(state('watched')).toBe('D1')
    expect(state('lead')).toBe('60')
    expect(state('busy')).toBe('false')
  })

  it('says so when the browser refused permission', async () => {
    const user = userEvent.setup()
    render(<Probe pushService={service({
      enableReminder: async () => ({ preference: null, permission: 'denied' }),
    })} />)

    await user.click(screen.getByRole('button', { name: 'enable' }))

    expect(state('watched')).toBe('none')
    expect(state('error')).toBe('Notifications are blocked for NUSGo, so no reminder was saved.')
  })

  it('explains a failed registration without leaving the control busy', async () => {
    const user = userEvent.setup()
    render(<Probe pushService={service({
      enableReminder: async () => { throw new Error('network') },
    })} />)

    await user.click(screen.getByRole('button', { name: 'enable' }))

    expect(state('error')).toBe('The reminder could not be changed. Try again.')
    expect(state('busy')).toBe('false')
  })

  it('clears the watch when it is turned off', async () => {
    const user = userEvent.setup()
    const disableReminder = vi.fn(async () => null)
    render(<Probe pushService={granted({ readReminder: () => SAVED, disableReminder })} />)

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'disable' }))
    })

    expect(disableReminder).toHaveBeenCalledOnce()
    expect(state('watched')).toBe('none')
  })
})

describe('useAlightReminder without a selected stop', () => {
  it('does nothing rather than registering a watch for an unknown stop', async () => {
    const user = userEvent.setup()
    const enableReminder = vi.fn(async (): Promise<EnableReminderResult> => ({ preference: null, permission: 'granted' }))
    render(<Probe pushService={service({ enableReminder })} stopId={null} />)
    await user.click(screen.getByRole('button', { name: 'enable' }))

    expect(enableReminder).not.toHaveBeenCalled()
    expect(state('watched')).toBe('none')
  })
})

// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  EnableReminderResult,
  PushNotificationService,
  ReminderPreference,
} from '../../../domain/push/push-notifications'
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

function Probe({ pushService, stopId = 'COM3' }: { readonly pushService: PushNotificationService; readonly stopId?: string | null }) {
  const reminder = useAlightReminder(pushService, stopId)
  return (
    <>
      <span data-testid="watched">{reminder.watchedRouteId ?? 'none'}</span>
      <span data-testid="permission">{reminder.permission}</span>
      <span data-testid="busy">{String(reminder.busy)}</span>
      <span data-testid="error">{reminder.errorMessage}</span>
      <button type="button" onClick={() => reminder.enable('D1')}>enable</button>
      <button type="button" onClick={reminder.disable}>disable</button>
    </>
  )
}

function state(testId: string): string | null {
  return screen.getByTestId(testId).textContent
}

const SAVED: ReminderPreference = { stopId: 'COM3', routeId: 'D1', endpoint: 'https://push.example.test/sub/1' }

/** A browser that already lets NUSGo show notifications, which is what a saved reminder implies. */
function granted(overrides: Partial<PushNotificationService> = {}): PushNotificationService {
  return service({
    getEnvironment: () => ({ availability: 'available', permission: 'granted' }),
    ...overrides,
  })
}

describe('useAlightReminder', () => {
  it('reports no watch for a stop nobody asked about', () => {
    render(<Probe pushService={granted({ readReminder: () => SAVED })} stopId="OTHER" />)

    expect(state('watched')).toBe('none')
  })

  it('reports the saved route only for the stop it names', () => {
    render(<Probe pushService={granted({ readReminder: () => SAVED })} />)

    expect(state('watched')).toBe('D1')
  })

  it('does not claim a watch the browser no longer permits', () => {
    render(<Probe pushService={service({
      getEnvironment: () => ({ availability: 'available', permission: 'denied' }),
      readReminder: () => SAVED,
    })} />)

    expect(state('watched')).toBe('none')
    expect(state('permission')).toBe('denied')
  })

  it('registers a watch from a tap and stores the result', async () => {
    const user = userEvent.setup()
    const enableReminder = vi.fn(async (): Promise<EnableReminderResult> => ({
      preference: SAVED,
      permission: 'granted',
    }))
    render(<Probe pushService={granted({ enableReminder })} />)

    await user.click(screen.getByRole('button', { name: 'enable' }))

    expect(enableReminder).toHaveBeenCalledWith({ stopId: 'COM3', routeId: 'D1' })
    expect(state('watched')).toBe('D1')
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

import { useCallback, useEffect, useState } from 'react'
import {
  PushSubscriptionError,
  type PushNotificationService,
  type ReminderPreference,
  type ReminderState,
} from '../../../domain/push/push-notifications'

const ERROR_MESSAGES: Record<string, string> = {
  'not-installed': 'Reminders need the installed NUSGo app. Install it first, then try again.',
  'not-configured': 'Reminders are not available from this server right now.',
  'invalid-subscription': 'This browser did not return a usable notification subscription.',
}

function errorMessageFor(error: unknown): string {
  const key = error instanceof PushSubscriptionError ? error.message : ''
  return ERROR_MESSAGES[key] ?? 'The reminder could not be changed. Try again.'
}

/**
 * Owns one stop's "remind me" control.
 *
 * The saved reminder is read once and then kept in state, so the control survives re-renders while
 * the browser's own environment is re-read on focus (Safari reports standalone state late).
 * Permission is requested only inside `enable`, which the control calls from the user's tap.
 */
export function useAlightReminder(
  service: PushNotificationService,
  stopId: string | null,
): ReminderState {
  const [environment, setEnvironment] = useState(service.getEnvironment)
  const [preference, setPreference] = useState<ReminderPreference | null>(service.readReminder)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const refresh = (): void => setEnvironment(service.getEnvironment())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [service])

  const enable = useCallback((routeId: string): void => {
    if (!stopId) return
    setBusy(true)
    setErrorMessage('')
    void service.enableReminder({ stopId, routeId })
      .then((result) => {
        setPreference(result.preference)
        // A refusal leaves the answer unchanged, but the button must stop claiming it worked.
        if (result.permission !== 'granted') {
          setErrorMessage('Notifications are blocked for NUSGo, so no reminder was saved.')
        }
        setEnvironment(service.getEnvironment())
      })
      .catch((error: unknown) => setErrorMessage(errorMessageFor(error)))
      .finally(() => setBusy(false))
  }, [service, stopId])

  const disable = useCallback((): void => {
    setBusy(true)
    setErrorMessage('')
    void service.disableReminder()
      .then((next) => setPreference(next))
      .catch((error: unknown) => setErrorMessage(errorMessageFor(error)))
      .finally(() => {
        setEnvironment(service.getEnvironment())
        setBusy(false)
      })
  }, [service])

  // Only a reminder for *this* stop counts as watched; a reminder saved elsewhere stays untouched
  // in storage and is replaced only when the rider asks for this stop instead.
  const watchedRouteId = stopId && preference?.stopId === stopId ? preference.routeId : null

  return {
    availability: environment.availability,
    permission: environment.permission,
    // A stored reminder only means "watching" while the browser still permits notifications.
    watchedRouteId: environment.permission === 'granted' ? watchedRouteId : null,
    busy,
    errorMessage,
    enable,
    disable,
  }
}

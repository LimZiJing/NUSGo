import { useCallback, useEffect, useState } from 'react'
import {
  PushSubscriptionError,
  type PushNotificationService,
  type PushNotificationsState,
  type PushPreference,
} from '../../domain/push/push-notifications'

const ERROR_MESSAGES: Record<string, string> = {
  'not-installed': 'Notifications need the installed NUSGo app. Install it first, then try again.',
  'not-configured': 'Notifications are not available from this server right now.',
  'invalid-subscription': 'This browser did not return a usable notification subscription.',
}

function errorMessageFor(error: unknown): string {
  const key = error instanceof PushSubscriptionError ? error.message : ''
  return ERROR_MESSAGES[key] ?? 'Notifications could not be changed. Try again.'
}

/**
 * Owns the Settings push toggle: the browser's reported capability, the saved preference that
 * survives a reload, and the subscribe/unsubscribe actions. Permission is requested only from
 * the button handler inside these actions.
 */
export function usePushNotifications(service: PushNotificationService): PushNotificationsState {
  const [environment, setEnvironment] = useState(service.getEnvironment)
  const [preference, setPreference] = useState<PushPreference | null>(service.readPreference)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Safari exposes loading and standalone state later than first render; re-read when the
  // document may have been installed or when the tab becomes visible again.
  useEffect(() => {
    const refresh = (): void => setEnvironment(service.getEnvironment())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [service])

  const enable = useCallback((): void => {
    setBusy(true)
    setErrorMessage('')
    void service.enable(preference)
      .then((result) => {
        setPreference(result.preference)
        setEnvironment(service.getEnvironment())
      })
      .catch((error: unknown) => setErrorMessage(errorMessageFor(error)))
      .finally(() => setBusy(false))
  }, [service, preference])

  const disable = useCallback((): void => {
    setBusy(true)
    setErrorMessage('')
    void service.disable()
      .then((next) => setPreference(next))
      .catch((error: unknown) => setErrorMessage(errorMessageFor(error)))
      .finally(() => {
        setEnvironment(service.getEnvironment())
        setBusy(false)
      })
  }, [service])

  // A stored preference only means "on" while the browser still permits notifications.
  const enabled = preference !== null && environment.permission === 'granted'

  return {
    availability: environment.availability,
    permission: environment.permission,
    enabled,
    busy,
    errorMessage,
    enable,
    disable,
  }
}

import { Button } from '../../../ui/button'
import { BellIcon } from '../../../ui/icons'
import type { PushAvailability, PushPermission } from '../../../domain/push/push-notifications'

interface PushNotificationsSectionProps {
  readonly availability: PushAvailability
  readonly permission: PushPermission
  readonly enabled: boolean
  readonly busy: boolean
  readonly errorMessage: string
  readonly onEnable: () => void
  readonly onDisable: () => void
}

function availabilityMessage(
  availability: PushAvailability,
  permission: PushPermission,
  enabled: boolean,
): string | null {
  if (availability === 'needs-home-screen') {
    return 'Push needs NUSGo added to your Home Screen first. Open the Share menu in Safari, choose Add to Home Screen, then open NUSGo from there.'
  }
  if (availability === 'unsupported') {
    return 'This browser cannot show push notifications.'
  }
  if (permission === 'denied') {
    return 'Notifications are blocked for NUSGo in your browser settings. Allow them there, then try again.'
  }
  if (enabled) return 'You will get a notification when a bus is delayed or live arrivals pause. Notifications show on this device only.'
  return 'Get a notification when a bus is delayed or live arrivals pause. You choose to turn this on; NUSGo only asks for permission after you tap Enable.'
}

/**
 * Settings control for web push.
 *
 * Permission is requested from the button handler, never on render, and the explanation is
 * always visible before the action so nobody sees a browser prompt without context.
 */
export function PushNotificationsSection({
  availability,
  permission,
  enabled,
  busy,
  errorMessage,
  onEnable,
  onDisable,
}: PushNotificationsSectionProps) {
  const message = availabilityMessage(availability, permission, enabled)
  const canToggle = availability === 'available' && permission !== 'denied'

  return (
    <div className="settings-push">
      <p className="settings-push-description" id="settings-push-description">{message}</p>
      {canToggle && (
        <Button
          label={busy ? 'Working' : enabled ? 'Turn off notifications' : 'Enable notifications'}
          variant={enabled ? 'secondary' : 'primary'}
          size="lg"
          icon={<BellIcon size={16} />}
          disabled={busy}
          busy={busy}
          ariaDescribedBy="settings-push-description"
          onClick={enabled ? onDisable : onEnable}
        />
      )}
      {errorMessage && <p className="settings-push-error" role="alert">{errorMessage}</p>}
    </div>
  )
}

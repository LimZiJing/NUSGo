import { useState } from 'react'
import { Button } from '../../../ui/button'
import { BellIcon } from '../../../ui/icons'
import { Select } from '../../../ui/select'
import type { PushAvailability, PushPermission, ReminderState } from '../../../domain/push/push-notifications'

export interface AlightReminderRoute {
  readonly routeId: string
  readonly routeName: string
}

interface AlightReminderControlProps {
  readonly stopId: string
  readonly stopName: string
  /** Shuttle routes this stop serves, live or currently outside their service hours. */
  readonly routes: readonly AlightReminderRoute[]
  readonly reminder: ReminderState
}

/**
 * What the rider is agreeing to, and what stops them. Shown before the button so nobody meets a
 * browser permission prompt without context, and the iOS answer points at the Home Screen fix
 * rather than claiming the device cannot do it.
 */
function availabilityMessage(
  availability: PushAvailability,
  permission: PushPermission,
  watchedRouteId: string | null,
  stopName: string,
): string | null {
  if (availability === 'needs-home-screen') {
    return 'Reminders need NUSGo added to your Home Screen first. Open the Share menu in Safari, choose Add to Home Screen, then open NUSGo from there.'
  }
  if (availability === 'unsupported') return 'This browser cannot show reminders.'
  if (permission === 'denied') {
    return 'Notifications are blocked for NUSGo in your browser settings. Allow them there, then try again.'
  }
  if (watchedRouteId) return `NUSGo will notify you once when bus ${watchedRouteId} is about to reach ${stopName}.`
  return `Get one notification when the next bus on a route is about to reach ${stopName}. NUSGo only asks for permission after you tap Remind me.`
}

/**
 * The "remind me" control on stop details (#503).
 *
 * Reminders are evaluated from arrival snapshots the server already publishes, so this control
 * only registers a stop-and-route watch; it never turns on location tracking.
 */
export function AlightReminderControl({ stopId, stopName, routes, reminder }: AlightReminderControlProps) {
  // One entry per route: a stop can list the same route as both live and scheduled.
  const options = [...new Map(routes.map(({ routeId, routeName }) => [routeId, {
    value: routeId,
    label: routeName === routeId ? routeId : `${routeId} · ${routeName}`,
  }])).values()]
  const [selectedRouteId, setSelectedRouteId] = useState(options[0]?.value ?? '')
  // Keep the chosen route valid when the routes under the control change.
  const routeId = options.some(({ value }) => value === selectedRouteId)
    ? selectedRouteId
    : options[0]?.value ?? ''

  const message = availabilityMessage(reminder.availability, reminder.permission, reminder.watchedRouteId, stopName)
  const canToggle = reminder.availability === 'available' &&
    reminder.permission !== 'denied' &&
    (reminder.watchedRouteId !== null || options.length > 0)

  return (
    <div className="stop-reminder">
      <p className="stop-reminder-description" id={`stop-reminder-description-${stopId}`}>{message}</p>
      {canToggle && (
        <div className="stop-reminder-actions">
          {/* An existing watch is only ever cancelled, so the route choice retires with it. */}
          {!reminder.watchedRouteId && options.length > 1 && (
            <Select
              className="stop-reminder-route"
              label="Route to watch"
              value={routeId}
              options={options}
              onChange={setSelectedRouteId}
            />
          )}
          <Button
            label={reminder.busy ? 'Working' : reminder.watchedRouteId ? 'Stop reminding me' : 'Remind me'}
            variant={reminder.watchedRouteId ? 'secondary' : 'primary'}
            icon={<BellIcon size={16} />}
            disabled={reminder.busy || (!reminder.watchedRouteId && routeId === '')}
            busy={reminder.busy}
            ariaDescribedBy={`stop-reminder-description-${stopId}`}
            onClick={reminder.watchedRouteId ? reminder.disable : () => reminder.enable(routeId)}
          />
        </div>
      )}
      {reminder.errorMessage && <p className="stop-reminder-error" role="alert">{reminder.errorMessage}</p>}
    </div>
  )
}

import { useState } from 'react'
import type { PushReminderLeadTimeSeconds } from '@nusgo/shared/push/reminders'
import { PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS, DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS } from '@nusgo/shared/push/reminders'
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

/** "2 minutes" reads better than "120 seconds"; every offered value is a whole minute. */
function describeLeadTime(seconds: PushReminderLeadTimeSeconds): string {
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

const LEAD_TIME_OPTIONS = PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS.map((seconds) => ({
  value: String(seconds),
  label: describeLeadTime(seconds),
}))

function leadTimeFromValue(value: string): PushReminderLeadTimeSeconds {
  const match = PUSH_REMINDER_LEAD_TIME_OPTIONS_SECONDS.find((seconds) => String(seconds) === value)
  return match ?? DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS
}

/**
 * What the rider is agreeing to, and what stops them. Shown before the button so nobody meets a
 * browser permission prompt without context, and the iOS answer points at the Home Screen fix
 * rather than claiming the device cannot do it.
 *
 * The lead time is always spelled out, because the reminder fires when the live ETA enters that
 * window rather than at a clock time, and the ETA itself is an estimate. Saying both is what stops
 * a rider treating "2 minutes" as a promise.
 */
function availabilityMessage(
  availability: PushAvailability,
  permission: PushPermission,
  stopName: string,
  leadTimeSeconds: PushReminderLeadTimeSeconds,
  watchedRouteId: string | null,
  watchedExpiresAt: string | null,
): string | null {
  if (availability === 'needs-home-screen') {
    return 'Reminders need NUSGo added to your Home Screen first. Open the Share menu in Safari, choose Add to Home Screen, then open NUSGo from there.'
  }
  if (availability === 'unsupported') return 'This browser cannot show reminders.'
  if (permission === 'denied') {
    return 'Notifications are blocked for NUSGo in your browser settings. Allow them there, then try again.'
  }
  if (watchedRouteId) {
    const expiry = watchedExpiresAt && Number.isFinite(Date.parse(watchedExpiresAt))
      ? ` It lapses by ${new Date(watchedExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} if the bus has not come.`
      : ' It lapses automatically if the bus has not come.'
    return `NUSGo will notify you once, about ${describeLeadTime(leadTimeSeconds)} before bus ${watchedRouteId} is due at ${stopName}, then stop. Times come from live estimates and can be approximate.${expiry}`
  }
  return `Get one notification about ${describeLeadTime(leadTimeSeconds)} before the next bus on the chosen route is due at ${stopName}. Timing uses approximate live estimates, not a timetable, and the reminder lapses automatically after two hours. NUSGo only asks for permission after you tap Remind me.`
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
  const [leadTimeSeconds, setLeadTimeSeconds] = useState<PushReminderLeadTimeSeconds>(
    DEFAULT_PUSH_REMINDER_LEAD_TIME_SECONDS,
  )

  // A stored watch reports its own lead time, so the explanation always matches what will fire.
  const shownLeadTime = reminder.watchedLeadTimeSeconds ?? leadTimeSeconds

  const message = availabilityMessage(
    reminder.availability,
    reminder.permission,
    stopName,
    shownLeadTime,
    reminder.watchedRouteId,
    reminder.watchedExpiresAt,
  )
  const canToggle = reminder.availability === 'available' &&
    reminder.permission !== 'denied' &&
    (reminder.watchedRouteId !== null || options.length > 0)

  return (
    <div className="stop-reminder">
      <p className="stop-reminder-description" id={`stop-reminder-description-${stopId}`}>{message}</p>
      {canToggle && (
        <div className="stop-reminder-actions">
          {/* An existing watch is only ever cancelled, so the route and lead-time choices retire with it. */}
          {!reminder.watchedRouteId && options.length > 1 && (
            <Select
              className="stop-reminder-route"
              label="Route to watch"
              value={routeId}
              options={options}
              onChange={setSelectedRouteId}
            />
          )}
          {!reminder.watchedRouteId && (
            <Select
              className="stop-reminder-lead-time"
              label="Lead time"
              value={String(leadTimeSeconds)}
              options={LEAD_TIME_OPTIONS}
              onChange={(value) => setLeadTimeSeconds(leadTimeFromValue(value))}
            />
          )}
          <Button
            label={reminder.busy ? 'Working' : reminder.watchedRouteId ? 'Stop reminding me' : 'Remind me'}
            variant={reminder.watchedRouteId ? 'secondary' : 'primary'}
            icon={<BellIcon size={16} />}
            disabled={reminder.busy || (!reminder.watchedRouteId && routeId === '')}
            busy={reminder.busy}
            ariaDescribedBy={`stop-reminder-description-${stopId}`}
            onClick={reminder.watchedRouteId ? reminder.disable : () => reminder.enable(routeId, leadTimeSeconds)}
          />
        </div>
      )}
      {/*
        The live region is always mounted and starts empty. A conditionally mounted alert would not
        be announced when it appears, so a failed change could go unnoticed by a screen reader.
      */}
      <p className="stop-reminder-error" role="alert">{reminder.errorMessage}</p>
    </div>
  )
}

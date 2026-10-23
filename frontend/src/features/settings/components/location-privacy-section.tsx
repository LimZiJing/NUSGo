import { useState } from 'react'
import type { LocationPermissionState } from '../../../domain/location/types'

type PermissionStatus = LocationPermissionState | 'checking'

interface LocationPrivacySectionProps {
  readonly permissionStatus: PermissionStatus
  readonly hasLocationActivity: boolean
  readonly onClearLocation: () => void
}

const PERMISSION_LABELS: Record<PermissionStatus, string> = {
  checking: 'Checking',
  granted: 'Allowed',
  denied: 'Denied',
  prompt: 'Not requested yet',
  unavailable: 'Not available in this browser',
}

export function LocationPrivacySection({
  permissionStatus,
  hasLocationActivity,
  onClearLocation,
}: LocationPrivacySectionProps) {
  const [statusMessage, setStatusMessage] = useState('')

  const clearLocation = (): void => {
    onClearLocation()
    setStatusMessage(
      'Current location cleared. Browser permission has not changed. A saved trip endpoint was not changed.',
    )
  }

  return (
    <section className="settings-section" aria-labelledby="settings-location-heading">
      <h3 id="settings-location-heading">Location &amp; privacy</h3>
      <p>
        Your live device location stays in this browser and is not sent to NavUS services. If you
        choose Current location as a trip endpoint, its frozen coordinates are sent to the NavUS
        routing service to calculate the route.
      </p>
      <p>Clearing this fix does not change a trip endpoint already set to Current location.</p>
      <dl className="settings-location-status">
        <dt>Browser location permission</dt>
        <dd aria-live="polite">{PERMISSION_LABELS[permissionStatus]}</dd>
      </dl>
      <button
        className="settings-action-button"
        type="button"
        disabled={!hasLocationActivity}
        onClick={clearLocation}
      >
        Clear current location
      </button>
      <p className="settings-status-message" role="status">{statusMessage}</p>
    </section>
  )
}

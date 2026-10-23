import { useState } from 'react'
import type { LocationPermissionState } from '../../../domain/location/types'
import { ChevronRightIcon, MapPinIcon } from '../../../ui/icons'

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
      <p className="settings-section-subtitle">
        Live location stays on your device; route requests send saved coordinates.
      </p>
      <p className="settings-location-permission">
        Browser permission <span aria-live="polite">{PERMISSION_LABELS[permissionStatus]}</span>
      </p>
      <button
        className="settings-location-action"
        type="button"
        disabled={!hasLocationActivity}
        onClick={clearLocation}
      >
        <MapPinIcon size={18} />
        <span>Clear current location</span>
        <ChevronRightIcon className="settings-row-chevron" size={18} />
      </button>
      <p className="settings-status-message" role="status">
        {statusMessage}
      </p>
    </section>
  )
}

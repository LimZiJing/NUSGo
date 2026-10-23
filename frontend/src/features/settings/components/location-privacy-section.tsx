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
  prompt: 'Not requested',
  unavailable: 'Unavailable',
}

export function LocationPrivacySection({
  permissionStatus,
  hasLocationActivity,
  onClearLocation,
}: LocationPrivacySectionProps) {
  const [statusMessage, setStatusMessage] = useState('')

  const clearLocation = (): void => {
    onClearLocation()
    setStatusMessage('Location cleared. Permission and trip endpoints are unchanged.')
  }

  return (
    <section className="settings-section" aria-labelledby="settings-location-heading">
      <h3 id="settings-location-heading">Location &amp; privacy</h3>
      <p className="settings-section-subtitle">
        Live location stays on this device; routes use saved coordinates.
      </p>
      <p className="settings-location-permission">
        Permission <span aria-live="polite">{PERMISSION_LABELS[permissionStatus]}</span>
      </p>
      <button
        className="settings-location-action"
        type="button"
        disabled={!hasLocationActivity}
        onClick={clearLocation}
      >
        <MapPinIcon size={18} />
        <span>Clear location</span>
        <ChevronRightIcon className="settings-row-chevron" size={18} />
      </button>
      {statusMessage && <p className="settings-status-message" role="status">{statusMessage}</p>}
    </section>
  )
}

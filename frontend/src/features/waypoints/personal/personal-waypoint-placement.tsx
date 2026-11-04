import { useEffect, useRef } from 'react'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { Button } from '../../../ui/button'
import { MapPinIcon } from '../../../ui/icons'

function formatSelectedCoordinate(coordinate: WaypointCoordinate): string {
  const latitude = `${Math.abs(coordinate.latitude).toFixed(6)}° ${coordinate.latitude < 0 ? 'S' : 'N'}`
  const longitude = `${Math.abs(coordinate.longitude).toFixed(6)}° ${coordinate.longitude < 0 ? 'W' : 'E'}`
  return `${latitude} · ${longitude}`
}

export function PersonalWaypointPlacement({ coordinate, onUseMapCentre, onContinue, onCancel }: {
  readonly coordinate: WaypointCoordinate
  readonly onUseMapCentre?: () => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  return <section className="personal-waypoint-placement" aria-label="Adjust waypoint location">
    <header className="personal-waypoint-placement-header">
      <h2 ref={headingRef} tabIndex={-1}>Adjust waypoint location</h2>
      <p>Tap the map or use its centre to move the pin, then return to your form.</p>
    </header>
    <div className="personal-waypoint-selected-location">
      <span className="personal-waypoint-selected-location-icon" aria-hidden="true"><MapPinIcon size={17} /></span>
      <div className="personal-waypoint-selected-location-copy">
        <strong className="personal-waypoint-selected-location-label">Selected location</strong>
        <span className="personal-waypoint-selected-location-coordinate" aria-live="polite">
          {formatSelectedCoordinate(coordinate)}
        </span>
      </div>
    </div>
    <Button label="Use map centre" variant="ghost" disabled={!onUseMapCentre} onClick={() => onUseMapCentre?.()} />
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Done adjusting location" variant="primary" onClick={onContinue} />
    </div>
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { isValidLocationCoordinates } from '../../../domain/location/coordinates'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { Button } from '../../../ui/button'
import { LocateIcon, MapPinIcon } from '../../../ui/icons'

function formatSelectedCoordinate(coordinate: WaypointCoordinate): string {
  const latitude = `${Math.abs(coordinate.latitude).toFixed(6)}° ${coordinate.latitude < 0 ? 'S' : 'N'}`
  const longitude = `${Math.abs(coordinate.longitude).toFixed(6)}° ${coordinate.longitude < 0 ? 'W' : 'E'}`
  return `${latitude} · ${longitude}`
}

export function PersonalWaypointPlacement({ coordinate, mapCenter, onChange, onContinue, onCancel }: {
  readonly coordinate: WaypointCoordinate
  readonly mapCenter: WaypointCoordinate | null
  readonly onChange: (coordinate: WaypointCoordinate) => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const latitudeInput = useRef<HTMLInputElement>(null)
  const longitudeInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  useEffect(() => {
    if (latitudeInput.current) latitudeInput.current.value = String(coordinate.latitude)
    if (longitudeInput.current) longitudeInput.current.value = String(coordinate.longitude)
  }, [coordinate.latitude, coordinate.longitude])
  const readCoordinates = (): WaypointCoordinate | null => {
    const latitude = latitudeInput.current?.value.trim() ?? ''
    const longitude = longitudeInput.current?.value.trim() ?? ''
    const nextLatitude = Number(latitude)
    const nextLongitude = Number(longitude)
    if (!latitude.trim() || !longitude.trim() || !isValidLocationCoordinates(nextLongitude, nextLatitude)) {
      setError('Enter valid latitude and longitude values.')
      return null
    }
    setError(null)
    return { latitude: nextLatitude, longitude: nextLongitude }
  }
  const applyCoordinates = (): void => {
    const next = readCoordinates()
    if (next) onChange(next)
  }
  const useMapCenter = (): void => {
    if (!mapCenter) return
    if (latitudeInput.current) latitudeInput.current.value = String(mapCenter.latitude)
    if (longitudeInput.current) longitudeInput.current.value = String(mapCenter.longitude)
    setError(null)
    onChange(mapCenter)
  }
  const continueToForm = (): void => {
    const next = readCoordinates()
    if (!next) return
    onChange(next)
    onContinue()
  }
  return <section className="personal-waypoint-placement" aria-label="Place personal waypoint">
    <h2 ref={headingRef} tabIndex={-1}>Place waypoint</h2>
    <p>Tap the map or drag the pin.</p>
    <div className="personal-waypoint-selected-location">
      <span className="personal-waypoint-selected-location-icon" aria-hidden="true"><MapPinIcon size={17} /></span>
      <span className="personal-waypoint-selected-location-copy">
        <strong>Selected location</strong>
        <span aria-live="polite">{formatSelectedCoordinate(coordinate)}</span>
      </span>
      <Button
        className="personal-waypoint-map-center"
        label="Use map centre"
        icon={<LocateIcon size={15} />}
        variant="ghost"
        onClick={useMapCenter}
        disabled={!mapCenter}
      />
    </div>
    <div className="personal-waypoint-coordinate-fields">
      <label htmlFor="personal-waypoint-latitude">Latitude</label>
      <input id="personal-waypoint-latitude" type="number" step="any" defaultValue={coordinate.latitude}
        ref={latitudeInput} onChange={() => setError(null)} />
      <label htmlFor="personal-waypoint-longitude">Longitude</label>
      <input id="personal-waypoint-longitude" type="number" step="any" defaultValue={coordinate.longitude}
        ref={longitudeInput} onChange={() => setError(null)} />
    </div>
    {error && <p className="personal-waypoint-error" role="alert">{error}</p>}
    <div className="personal-waypoint-placement-tools">
      <Button label="Apply coordinates" onClick={applyCoordinates} />
    </div>
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Continue" variant="primary" onClick={continueToForm} />
    </div>
  </section>
}

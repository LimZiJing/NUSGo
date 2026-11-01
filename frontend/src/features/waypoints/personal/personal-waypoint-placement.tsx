import { useEffect, useRef, useState } from 'react'
import { isValidLocationCoordinates } from '../../../domain/location/coordinates'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { Button } from '../../../ui/button'
import { ChevronDownIcon, LocateIcon, MapPinIcon } from '../../../ui/icons'

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
  type CoordinateField = 'latitude' | 'longitude'
  const headingRef = useRef<HTMLHeadingElement>(null)
  const latitudeInput = useRef<HTMLInputElement>(null)
  const longitudeInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<CoordinateField | null>(null)
  const [coordinateEntryOpen, setCoordinateEntryOpen] = useState(false)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  useEffect(() => {
    if (latitudeInput.current) latitudeInput.current.value = String(coordinate.latitude)
    if (longitudeInput.current) longitudeInput.current.value = String(coordinate.longitude)
  }, [coordinate.latitude, coordinate.longitude])
  useEffect(() => {
    if (!coordinateEntryOpen || !invalidField) return
    const invalidInput = invalidField === 'latitude' ? latitudeInput.current : longitudeInput.current
    invalidInput?.focus()
  }, [coordinateEntryOpen, invalidField])
  const readCoordinates = (): WaypointCoordinate | null => {
    const latitude = latitudeInput.current?.value.trim() ?? ''
    const longitude = longitudeInput.current?.value.trim() ?? ''
    const nextLatitude = Number(latitude)
    const nextLongitude = Number(longitude)
    const latitudeIsInvalid = !latitude || !Number.isFinite(nextLatitude)
      || nextLatitude < -90 || nextLatitude > 90
    const longitudeIsInvalid = !longitude || !Number.isFinite(nextLongitude)
      || nextLongitude < -180 || nextLongitude > 180
    if (latitudeIsInvalid || longitudeIsInvalid
      || !isValidLocationCoordinates(nextLongitude, nextLatitude)) {
      const field = latitudeIsInvalid ? 'latitude' : 'longitude'
      setInvalidField(field)
      setError(field === 'latitude'
        ? 'Latitude must be between −90 and 90.'
        : 'Longitude must be between −180 and 180.')
      setCoordinateEntryOpen(true)
      return null
    }
    setError(null)
    setInvalidField(null)
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
    setInvalidField(null)
    onChange(mapCenter)
  }
  const clearError = (): void => {
    setError(null)
    setInvalidField(null)
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
    <div className="personal-waypoint-coordinate-disclosure">
      <Button
        className="personal-waypoint-coordinate-toggle"
        label="Enter coordinates"
        trailingIcon={<ChevronDownIcon size={16} />}
        variant="ghost"
        expanded={coordinateEntryOpen}
        controls="personal-waypoint-coordinate-fields"
        onClick={() => setCoordinateEntryOpen((open) => !open)}
      />
      <div
        id="personal-waypoint-coordinate-fields"
        className="personal-waypoint-coordinate-content"
        role="group"
        aria-label="Waypoint coordinates"
        hidden={!coordinateEntryOpen}
      >
        <div className="personal-waypoint-coordinate-fields">
          <label className="personal-waypoint-coordinate-field" htmlFor="personal-waypoint-latitude">
            <span>Latitude</span>
            <input id="personal-waypoint-latitude" type="number" step="any" defaultValue={coordinate.latitude}
              ref={latitudeInput} aria-invalid={invalidField === 'latitude'}
              aria-describedby={error ? 'personal-waypoint-coordinate-error' : undefined} onChange={clearError} />
          </label>
          <label className="personal-waypoint-coordinate-field" htmlFor="personal-waypoint-longitude">
            <span>Longitude</span>
            <input id="personal-waypoint-longitude" type="number" step="any" defaultValue={coordinate.longitude}
              ref={longitudeInput} aria-invalid={invalidField === 'longitude'}
              aria-describedby={error ? 'personal-waypoint-coordinate-error' : undefined} onChange={clearError} />
          </label>
        </div>
        {error && <p id="personal-waypoint-coordinate-error" className="personal-waypoint-error" role="alert">{error}</p>}
        <div className="personal-waypoint-coordinate-actions">
          <Button label="Apply coordinates" onClick={applyCoordinates} />
        </div>
      </div>
    </div>
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Continue" variant="primary" onClick={continueToForm} />
    </div>
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { isValidLocationCoordinates } from '../../../domain/location/coordinates'
import type { WaypointCoordinate } from '../../../domain/waypoints/waypoint'
import { Button } from '../../../ui/button'

export function PersonalWaypointPlacement({ coordinate, mapCenter, onChange, onContinue, onCancel }: {
  readonly coordinate: WaypointCoordinate
  readonly mapCenter: WaypointCoordinate | null
  readonly onChange: (coordinate: WaypointCoordinate) => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}) {
  const latitudeInput = useRef<HTMLInputElement>(null)
  const longitudeInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
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
    <h2>Place waypoint</h2>
    <p>Tap the map or drag the pin. You can also enter coordinates.</p>
    <div className="personal-waypoint-coordinate-fields">
      <label htmlFor="personal-waypoint-latitude">Latitude</label>
      <input id="personal-waypoint-latitude" type="number" step="any" defaultValue={coordinate.latitude}
        ref={latitudeInput} autoFocus onChange={() => setError(null)} />
      <label htmlFor="personal-waypoint-longitude">Longitude</label>
      <input id="personal-waypoint-longitude" type="number" step="any" defaultValue={coordinate.longitude}
        ref={longitudeInput} onChange={() => setError(null)} />
    </div>
    {error && <p className="personal-waypoint-error" role="alert">{error}</p>}
    <div className="personal-waypoint-placement-tools">
      <Button label="Apply coordinates" onClick={applyCoordinates} />
      <Button label="Use map centre" onClick={useMapCenter} disabled={!mapCenter} />
    </div>
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Continue" variant="primary" onClick={continueToForm} />
    </div>
  </section>
}

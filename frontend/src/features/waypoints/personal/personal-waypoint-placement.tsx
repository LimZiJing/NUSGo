import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { parseCoordinateInput } from '../../../domain/waypoints/parse-coordinate-input'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { Button } from '../../../ui/button'
import { LocateIcon, MapPinIcon } from '../../../ui/icons'

function formatSelectedCoordinate(coordinate: WaypointCoordinate): string {
  const latitude = `${Math.abs(coordinate.latitude).toFixed(6)}° ${coordinate.latitude < 0 ? 'S' : 'N'}`
  const longitude = `${Math.abs(coordinate.longitude).toFixed(6)}° ${coordinate.longitude < 0 ? 'W' : 'E'}`
  return `${latitude} · ${longitude}`
}

function formatCoordinateInput(coordinate: WaypointCoordinate): string {
  return `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`
}

const OUTSIDE_SINGAPORE_NOTE = 'This point is outside Singapore. Check latitude comes first.'

export function PersonalWaypointPlacement({
  coordinate,
  onUseMapCentre,
  onApplyCoordinate,
  onContinue,
  onCancel,
}: {
  readonly coordinate: WaypointCoordinate
  readonly onUseMapCentre?: () => void
  /** Called with a coordinate the person typed or pasted; it has passed validation. */
  readonly onApplyCoordinate: (coordinate: WaypointCoordinate) => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusToEdit = useRef(false)
  const [editing, setEditing] = useState(false)
  // The input follows the pin until the person types, so a pin drag never leaves stale text to apply.
  const [typed, setTyped] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  // Remember which point the warning belongs to, so moving the pin elsewhere clears it.
  const [warnedFor, setWarnedFor] = useState<string | null>(null)
  const currentText = formatCoordinateInput(coordinate)
  const inputValue = typed ?? currentText
  const visibleWarning = warning && warnedFor === currentText ? warning : ''

  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (returnFocusToEdit.current) {
      returnFocusToEdit.current = false
      editButtonRef.current?.focus()
    }
  }, [editing])

  const openEdit = (): void => {
    setTyped(null)
    setError(null)
    setEditing(true)
  }
  const closeEdit = (): void => {
    returnFocusToEdit.current = true
    setTyped(null)
    setError(null)
    setEditing(false)
  }
  /** Applies the typed text when it is valid; otherwise shows why and keeps the edit open. */
  const applyTyped = (): boolean => {
    const result = parseCoordinateInput(inputValue)
    if (!result.ok) {
      setError(result.message)
      inputRef.current?.focus()
      return false
    }
    onApplyCoordinate(result.coordinate)
    setWarning(result.outsideSingapore ? OUTSIDE_SINGAPORE_NOTE : null)
    setWarnedFor(formatCoordinateInput(result.coordinate))
    closeEdit()
    return true
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    applyTyped()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    // Keep Escape from also closing the surrounding sheet or menu.
    event.preventDefault()
    event.stopPropagation()
    closeEdit()
  }
  const done = (): void => {
    if (editing && typed !== null && !applyTyped()) return
    onContinue()
  }

  return <section className="personal-waypoint-placement" aria-label="Adjust waypoint location">
    <header className="personal-waypoint-placement-header">
      <h2 ref={headingRef} tabIndex={-1}>Adjust waypoint location</h2>
      <p>Tap the map or use its centre to move the pin, then return to your form.</p>
    </header>
    <div className="personal-waypoint-location-group">
      <div className="personal-waypoint-selected-location" data-editing={editing || undefined}>
        <span className="personal-waypoint-selected-location-icon" aria-hidden="true"><MapPinIcon size={17} /></span>
        <div className="personal-waypoint-selected-location-copy">
          <strong className="personal-waypoint-selected-location-label" id="personal-waypoint-selected-location-label">
            Selected location
          </strong>
          {editing
            ? <form className="personal-waypoint-coordinate-entry" data-owns-escape="true" onSubmit={submit} noValidate>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                placeholder="1.2966, 103.7764"
                aria-labelledby="personal-waypoint-selected-location-label"
                aria-description="Latitude, then longitude, in decimal degrees"
                aria-invalid={Boolean(error)}
                aria-errormessage={error ? 'personal-waypoint-coordinate-error' : undefined}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                onChange={(event) => { setTyped(event.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
              />
            </form>
            : <span className="personal-waypoint-selected-location-coordinate" aria-live="polite">
              {formatSelectedCoordinate(coordinate)}
            </span>}
        </div>
        <Button
          ref={editButtonRef}
          label={editing ? 'Close' : 'Edit'}
          ariaLabel={editing ? 'Close coordinate entry' : 'Edit coordinates'}
          variant="ghost"
          onClick={editing ? closeEdit : openEdit}
        />
      </div>
      {error && <p id="personal-waypoint-coordinate-error" className="personal-waypoint-error" role="alert">{error}</p>}
      <p className="personal-waypoint-coordinate-note" role="status">{visibleWarning}</p>
      <Button
        className="personal-waypoint-use-centre"
        label="Use map centre"
        icon={<LocateIcon size={16} />}
        disabled={!onUseMapCentre}
        onClick={() => onUseMapCentre?.()}
      />
    </div>
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Done adjusting location" variant="primary" onClick={done} />
    </div>
  </section>
}

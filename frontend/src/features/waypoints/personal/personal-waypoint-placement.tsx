import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { parseCoordinateInput } from '../../../domain/waypoints/parse-coordinate-input'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { MapPinIcon } from '../../../ui/icons'
import { getIsMobileViewport } from '../../../ui/mobile/mobile-viewport'

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
  showCurrentLocationAction,
  onUseMapCentre,
  onUseCurrentLocation,
  onApplyCoordinate,
  onContinue,
  onCancel,
}: {
  readonly coordinate: WaypointCoordinate
  readonly showCurrentLocationAction?: boolean
  readonly onUseMapCentre?: () => void
  readonly onUseCurrentLocation?: () => void
  /** Called with a coordinate the person typed or pasted; it has passed validation. */
  readonly onApplyCoordinate: (coordinate: WaypointCoordinate) => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
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
      if (!getIsMobileViewport()) {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
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
      if (!getIsMobileViewport()) inputRef.current?.focus()
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

  // The panel is pinned to the bottom of the map stage, and the page opts into
  // `interactive-widget=overlays-content`, so the software keyboard does not resize the layout
  // viewport — it covers the bottom of the screen instead. Without this the coordinate input stays
  // exactly where the keyboard is, and neither the field nor what is typed into it can be seen.
  // The panel is lifted by however much of it the keyboard covers, and its height is capped so the
  // lift can never push its own heading off the top of the screen.
  useEffect(() => {
    const panel = panelRef.current
    const viewport = window.visualViewport
    if (!panel || !viewport) return

    let frame: number | null = null
    let lift = 0
    const reposition = (): void => {
      frame = null
      // Measure from where the panel would sit without a lift. Reading the lifted rect and feeding
      // it back would make each pass cancel the previous one, so the lift is subtracted off first.
      const bounds = panel.getBoundingClientRect()
      const baseBottom = bounds.bottom + lift
      const visibleTop = viewport.offsetTop
      const visibleBottom = visibleTop + viewport.height
      const covered = baseBottom - visibleBottom
      lift = covered > 0 ? Math.ceil(covered) : 0
      // Cap the height to the room between the keyboard's top edge and the panel's own top margin,
      // so lifting a tall panel scrolls its contents instead of hiding the heading off-screen.
      const containingTop = panel.offsetParent?.getBoundingClientRect().top ?? visibleTop
      const room = baseBottom - lift - containingTop - 16
      panel.style.setProperty('--personal-waypoint-keyboard-lift', `${lift}px`)
      panel.style.setProperty('--personal-waypoint-keyboard-max-height', `${Math.max(160, Math.floor(room))}px`)
    }
    const schedule = (): void => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(reposition)
    }

    reposition()
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      panel.style.removeProperty('--personal-waypoint-keyboard-lift')
      panel.style.removeProperty('--personal-waypoint-keyboard-max-height')
    }
  }, [])

  return <section className="personal-waypoint-placement" aria-label="Adjust waypoint location" ref={panelRef}>
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
              <TextInput
                ref={inputRef}
                id="personal-waypoint-coordinate-input"
                label="Selected location"
                isLabelHidden
                type="text"
                inputMode="decimal"
                htmlName="coordinate"
                value={inputValue}
                placeholder="1.2966, 103.7764"
                hasSpellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                enterKeyHint="done"
                status={error ? { type: 'error' } : undefined}
                containerClassName="personal-waypoint-coordinate-astryx-field"
                controlClassName="personal-waypoint-coordinate-astryx-control"
                aria-description="Latitude, then longitude, in decimal degrees"
                aria-describedby={error ? 'personal-waypoint-coordinate-error' : undefined}
                onChange={(value) => { setTyped(value); setError(null) }}
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
          aria-label={editing ? 'Close coordinate entry' : 'Edit coordinates'}
          variant="ghost"
          onClick={editing ? closeEdit : openEdit}
        />
      </div>
      {error && <p id="personal-waypoint-coordinate-error" className="personal-waypoint-error" role="alert">{error}</p>}
      <p className="personal-waypoint-coordinate-note" role="status">{visibleWarning}</p>
      <div className="personal-waypoint-placement-location-actions">
        <Button
          className="personal-waypoint-use-centre personal-waypoint-location-action"
          label="Use map centre"
          isDisabled={!onUseMapCentre}
          onClick={() => onUseMapCentre?.()}
        />
        {showCurrentLocationAction && <Button
          className="personal-waypoint-use-current-location personal-waypoint-location-action"
          label="Use current location"
          isDisabled={!onUseCurrentLocation}
          tooltip={!onUseCurrentLocation ? 'Current location is unavailable' : undefined}
          onClick={() => onUseCurrentLocation?.()}
        />}
      </div>
    </div>
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button label="Done adjusting location" variant="primary" onClick={done} />
    </div>
  </section>
}

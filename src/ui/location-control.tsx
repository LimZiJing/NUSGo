import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { LocationTrackingState } from '../domain/location/types'

export interface LocationControlProps {
  readonly location: LocationTrackingState
  readonly markerVisible: boolean
  readonly topOffset: number
  readonly onEnable: () => void
  readonly onDisable: () => void
  readonly onHideMarker: () => void
  readonly onShowMarker: () => void
}

const POPOVER_ID = 'location-control-popover'

function getLocationStatusMessage(location: LocationTrackingState): string {
  switch (location.status) {
    case 'requesting':
      return 'Requesting your location…'
    case 'tracking':
      return 'Location tracking is on'
    case 'stale':
      return 'Location is stale. Move to get a fresh position.'
    case 'denied':
      return 'Location permission was denied. Allow it in your browser settings, then try again.'
    case 'unavailable':
      return 'Your location is not available right now. Try again.'
    case 'timeout':
      return 'Getting your location took too long. Try again.'
    case 'invalid':
      return 'Your browser returned an invalid location. Try again.'
    case 'low-accuracy':
      return 'Your location is not accurate enough yet. Try again.'
    case 'disabled':
      return 'Location sharing is off'
  }
}

function isTrackingStatus(status: LocationTrackingState['status']): boolean {
  return status === 'tracking' || status === 'stale'
}

export function LocationControl({
  location,
  markerVisible,
  topOffset,
  onEnable,
  onDisable,
  onHideMarker,
  onShowMarker,
}: LocationControlProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((): void => {
    setOpen(false)
    chipRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, open])

  const tracking = isTrackingStatus(location.status)
  const requesting = location.status === 'requesting'
  const accuracy = location.latestFix ? Math.round(location.latestFix.accuracy) : null

  return (
    <div
      className="location-control"
      ref={rootRef}
      style={{ '--location-control-top': `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <button
        className="location-control-chip"
        type="button"
        ref={chipRef}
        aria-controls={POPOVER_ID}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Location
      </button>
      {open && (
        <div
          className="location-control-popover"
          id={POPOVER_ID}
          role="group"
          aria-label="Location controls"
        >
          <p className="location-control-status" role="status">
            {getLocationStatusMessage(location)}
          </p>
          {accuracy !== null && <p className="location-control-accuracy">Accuracy: ±{accuracy} m</p>}
          {requesting && (
            <button type="button" disabled>Requesting location…</button>
          )}
          {!tracking && !requesting && (
            <button type="button" onClick={onEnable}>
              {location.status === 'disabled' ? 'Use my location' : 'Try location again'}
            </button>
          )}
          {tracking && (
            <>
              <button type="button" onClick={markerVisible ? onHideMarker : onShowMarker}>
                {markerVisible ? 'Hide location marker' : 'Show location marker'}
              </button>
              <button type="button" onClick={onDisable}>Stop location tracking</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

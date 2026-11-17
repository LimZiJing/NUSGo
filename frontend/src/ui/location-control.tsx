import { LocateIcon } from './icons'
import { MapOverlayIconButton } from './map-overlay-icon-button'

export interface LocationControlProps {
  readonly visible?: boolean
  readonly onRootChange?: (root: HTMLDivElement | null) => void
  readonly searching: boolean
  readonly onLocate: () => void
}

export function LocationControl({
  visible = true,
  onRootChange,
  searching,
  onLocate,
}: LocationControlProps) {
  if (!visible) return null

  const buttonLabel = searching
    ? 'Recenter map while finding your location'
    : 'Show my location'

  return (
    <div
      className="location-control"
      ref={onRootChange}
    >
      <MapOverlayIconButton
        label={buttonLabel}
        title={buttonLabel}
        busy={searching}
        icon={
          <>
            <LocateIcon className="location-control-icon" />
            {searching && <span className="location-control-spinner" aria-hidden="true" />}
          </>
        }
        onClick={onLocate}
      />
      {searching && (
        <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          Finding your location
        </span>
      )}
    </div>
  )
}

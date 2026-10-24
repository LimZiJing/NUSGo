import { Button } from '@base-ui/react/button'
import type { CSSProperties } from 'react'
import { LocateIcon } from './icons'

export interface LocationControlProps {
  readonly visible?: boolean
  readonly onRootChange?: (root: HTMLDivElement | null) => void
  readonly topOffset: number
  readonly searching: boolean
  readonly onLocate: () => void
}

export function LocationControl({
  visible = true,
  onRootChange,
  topOffset,
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
      style={{ '--location-control-top': `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <Button
        className="location-control-chip map-control-surface"
        type="button"
        aria-label={buttonLabel}
        aria-busy={searching}
        title={buttonLabel}
        onClick={onLocate}
      >
        <LocateIcon className="location-control-icon" />
        {searching && <span className="location-control-spinner" aria-hidden="true" />}
      </Button>
      {searching && (
        <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          Finding your location
        </span>
      )}
    </div>
  )
}

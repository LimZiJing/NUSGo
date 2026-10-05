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

  return (
    <div
      className="location-control"
      ref={onRootChange}
      style={{ '--location-control-top': `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <button
        className={`location-control-chip${searching ? ' location-control-chip-searching' : ''}`}
        type="button"
        aria-label={searching ? 'Finding your location' : 'Show my location'}
        aria-busy={searching}
        title={searching ? 'Finding your location' : 'Show my location'}
        disabled={searching}
        onClick={onLocate}
      >
        <LocateIcon className="location-control-icon" />
        {searching && <span className="location-control-spinner" aria-hidden="true" />}
      </button>
      {searching && (
        <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          Finding your location
        </span>
      )}
    </div>
  )
}

import type { CSSProperties } from 'react'

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
        <svg className="location-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle className="location-control-icon-center" cx="12" cy="12" r="2" />
        </svg>
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

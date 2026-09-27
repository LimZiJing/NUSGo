import type { CSSProperties } from 'react'

export interface LocationControlProps {
  readonly topOffset: number
  readonly onLocate: () => void
}

export function LocationControl({ topOffset, onLocate }: LocationControlProps) {
  return (
    <div
      className="location-control"
      style={{ '--location-control-top': `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <button
        className="location-control-chip"
        type="button"
        aria-label="Show my location"
        title="Show my location"
        onClick={onLocate}
      >
        <svg className="location-control-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle className="location-control-icon-center" cx="12" cy="12" r="2" />
        </svg>
      </button>
    </div>
  )
}

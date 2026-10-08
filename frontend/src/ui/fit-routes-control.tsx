import { RouteIcon } from './icons'

export interface FitRoutesControlProps {
  readonly onFit: () => void
}

export function FitRoutesControl({ onFit }: FitRoutesControlProps) {
  return (
    <button
      className="fit-routes-control"
      type="button"
      aria-label="Fit routes"
      title="Fit routes"
      onClick={onFit}
    >
      <RouteIcon className="fit-routes-control-icon" />
    </button>
  )
}

export interface MapRecenterControlProps {
  readonly visible: boolean
  readonly onRootChange?: (root: HTMLDivElement | null) => void
  readonly onRecenter: () => void
}

export function MapRecenterControl({
  visible,
  onRootChange,
  onRecenter,
}: MapRecenterControlProps) {
  if (!visible) return null

  const setRootRef = (element: HTMLDivElement | null): void => {
    onRootChange?.(element)
  }

  return (
    <div className="map-recenter-control" ref={setRootRef}>
      <button
        className="map-recenter-button"
        type="button"
        aria-label="Recenter map"
        title="Recenter map"
        onClick={onRecenter}
      >
        <svg className="map-recenter-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle className="map-recenter-icon-center" cx="12" cy="12" r="2" />
        </svg>
      </button>
    </div>
  )
}

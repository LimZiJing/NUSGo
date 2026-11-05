import { BusIcon } from '../../../ui/icons'

export interface LiveBusToggleProps {
  readonly enabled: boolean
  readonly onToggle: (enabled: boolean) => void
}

export function LiveBusToggle({ enabled, onToggle }: LiveBusToggleProps) {
  return (
    <button
      type="button"
      className="map-overlay-button live-bus-toggle"
      aria-label="Live buses"
      aria-pressed={enabled}
      title={enabled ? 'Hide live buses' : 'Show live buses'}
      onClick={() => onToggle(!enabled)}
    >
      <BusIcon />
    </button>
  )
}

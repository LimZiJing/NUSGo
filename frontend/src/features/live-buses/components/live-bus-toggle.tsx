import { MapOverlayIconButton } from '../../../ui/map-overlay-icon-button'
import { BusIcon } from '../../../ui/icons'

export interface LiveBusToggleProps {
  readonly enabled: boolean
  readonly onToggle: (enabled: boolean) => void
}

export function LiveBusToggle({ enabled, onToggle }: LiveBusToggleProps) {
  return (
    <MapOverlayIconButton
      className="live-bus-toggle"
      label="Live buses"
      title={enabled ? 'Hide live buses' : 'Show live buses'}
      icon={<BusIcon />}
      pressed={enabled}
      onClick={() => onToggle(!enabled)}
    />
  )
}

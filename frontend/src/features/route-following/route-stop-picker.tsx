import type { TransitStop } from '@nusgo/shared/transit/types'
import { getBusStopName } from '../../domain/transit'
import { Select } from '../../ui/select'

interface RouteStopPickerProps {
  readonly label: string
  readonly stops: readonly TransitStop[]
  readonly value: string
  readonly onChange: (stopId: string) => void
}

export function RouteStopPicker({ label, stops, value, onChange }: RouteStopPickerProps) {
  return (
    <Select
      label={label}
      value={value}
      options={stops.map((stop) => ({ value: stop.id, label: getBusStopName(stop) }))}
      onChange={onChange}
      hideLabel
      className="route-following-stop-picker"
    />
  )
}

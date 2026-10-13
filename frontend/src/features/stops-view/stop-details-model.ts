import type { TransitStop } from '@navus/shared/transit/types'
import type { TransitIndex } from '../../domain/transit'
import {
  getStopTimingData,
  type StopTimingData,
  type StopTimingDataOptions,
} from './stop-timing-data'

export interface StopDetailsModel extends StopTimingData {
  readonly id: string
  readonly longName: string
  readonly oppositeStop: { readonly id: string; readonly longName: string } | null
}

export function getStopDetailsModel(
  stop: TransitStop,
  index: TransitIndex,
  timingOptions: StopTimingDataOptions,
): StopDetailsModel {
  const oppositeStop = stop.opposite ? index.stopById.get(stop.opposite) : null
  const timingData = getStopTimingData(stop, index, timingOptions)

  return {
    id: stop.id,
    longName: stop.longName,
    oppositeStop: oppositeStop ? { id: oppositeStop.id, longName: oppositeStop.longName } : null,
    ...timingData,
  }
}

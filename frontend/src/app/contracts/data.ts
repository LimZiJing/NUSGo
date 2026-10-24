import type { TransitIndex } from '../../domain/transit'
import type { ShuttleTimingData } from '@nusgo/shared/transit/timing'
import type {
  TransitNetwork,
  BusRouteGeometry,
} from '@nusgo/shared/transit/types'
import type { BuildingIndex } from '../../domain/venue/building-index'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'

export interface LoadedVenueData {
  readonly venues: VenueLocationMap
  readonly venueCount: number
  /** Supplemental buildings; empty when the catalogue could not be loaded. */
  readonly buildings?: BuildingIndex
}

export interface LoadedTransitData {
  readonly network: TransitNetwork
  readonly geometry: BusRouteGeometry
  readonly index: TransitIndex
  readonly shuttleTiming: ShuttleTimingData
}

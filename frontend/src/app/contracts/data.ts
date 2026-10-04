import type { TransitIndex } from '../../domain/transit'
import type { ShuttleTimingData } from '../../domain/transit/timing'
import type {
  TransitNetwork,
  TransitRouteGeometry,
} from '../../domain/transit/types'
import type { VenueLocationMap } from '../../domain/venue/types'

export interface LoadedVenueData {
  readonly venues: VenueLocationMap
  readonly venueCount: number
}

export interface LoadedTransitData {
  readonly network: TransitNetwork
  readonly geometry: TransitRouteGeometry
  readonly index: TransitIndex
  readonly shuttleTiming: ShuttleTimingData
}

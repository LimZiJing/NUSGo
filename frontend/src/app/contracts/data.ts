import type { TransitIndex } from '../../domain/transit'
import type { ShuttleTimingData } from '@navus/shared/transit/timing'
import type {
  TransitNetwork,
  TransitRouteGeometry,
} from '@navus/shared/transit/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'

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

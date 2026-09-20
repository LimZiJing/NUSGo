import type { TransitIndex } from '../../domain/transit'
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
}

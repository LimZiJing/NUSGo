import { createTransitNetworkIndex, type TransitNetworkIndex } from '../../domain/transit'
import { validateTransitMapData } from '../../domain/transit/map-data'
import { validateVenueLocationMap, getVenueCount } from '../../domain/venue/validation'
import { fetchJson } from './json'
import type { TransitRouteGeometry, TransitNetwork } from '../../domain/transit/types'
import type { VenueLocationMap } from '../../domain/venue/types'

export type JsonFetcher = (
  path: string,
  signal: AbortSignal,
  resourceName: string,
) => Promise<unknown>

export interface LoadedVenueData {
  readonly venues: VenueLocationMap
  readonly venueCount: number
}

export interface LoadedTransitMapData {
  readonly network: TransitNetwork
  readonly geometry: TransitRouteGeometry
  readonly index: TransitNetworkIndex
}

export async function loadVenueData(
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<LoadedVenueData> {
  const venues = validateVenueLocationMap(
    await fetcher('data/venues.json', signal, 'Venue data'),
  )
  return {
    venues,
    venueCount: getVenueCount(venues),
  }
}

export async function loadTransitMapData(
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<LoadedTransitMapData> {
  const { network, geometry } = validateTransitMapData(
    await fetcher('/data/shuttle-network.json', signal, 'Shuttle network'),
    await fetcher('/data/shuttle-routes.geojson', signal, 'Shuttle route geometry'),
  )
  return {
    network,
    geometry,
    index: createTransitNetworkIndex(network),
  }
}

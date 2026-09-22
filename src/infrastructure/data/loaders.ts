import { createTransitNetworkIndex } from '../../domain/transit'
import type { LoadedTransitData, LoadedVenueData } from '../../app/contracts/data'
import { validateTransitMapData } from '../../domain/transit/map-data'
import { validateVenueLocationMap, getVenueCount } from '../../domain/venue/validation'
import { validateShuttleTimingData } from '../../domain/transit/timing'
import type { ShuttleTimingData } from '../../domain/transit/timing'
import type { TransitNetwork } from '../../domain/transit/types'
import { fetchJson } from './json'

export type JsonFetcher = (
  path: string,
  signal: AbortSignal,
  resourceName: string,
) => Promise<unknown>

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
): Promise<LoadedTransitData> {
  const [networkInput, geometryInput, timingInput] = await Promise.all([
    fetcher('/data/shuttle-network.json', signal, 'Shuttle network'),
    fetcher('/data/shuttle-routes.geojson', signal, 'Shuttle route geometry'),
    fetcher('/data/shuttle-timing.json', signal, 'Shuttle timing'),
  ])
  const { network, geometry } = validateTransitMapData(networkInput, geometryInput)
  const index = createTransitNetworkIndex(network)
  const shuttleTiming = validateShuttleTimingData(timingInput, index.network)
  return { network: index.network, geometry, index, shuttleTiming }
}

export async function loadShuttleTimingData(
  network: TransitNetwork,
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<ShuttleTimingData> {
  return validateShuttleTimingData(
    await fetcher('/data/shuttle-timing.json', signal, 'Shuttle timing'),
    network,
  )
}

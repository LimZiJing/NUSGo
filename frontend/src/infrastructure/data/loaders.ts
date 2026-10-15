import { createTransitNetworkIndex } from '../../domain/transit'
import type { LoadedTransitData, LoadedVenueData } from '../../app/contracts/data'
import { validateTransitMapData } from '@navus/shared/transit/map-data'
import { validateBuildingCatalogue, validateVenueLocationMap, getVenueCount } from '@navus/shared/venue/validation'
import { validateShuttleTimingData } from '@navus/shared/transit/timing'
import type { ShuttleTimingData } from '@navus/shared/transit/timing'
import type { BuildingCatalogue } from '@navus/shared/venue/buildings'
import type { TransitNetwork } from '@navus/shared/transit/types'
import { buildBuildingIndex, EMPTY_BUILDING_INDEX, type BuildingIndex } from '../../domain/venue/building-index'
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
    buildings: await loadBuildingIndex(signal, fetcher),
  }
}

// Buildings supplement venues, so a missing or invalid catalogue must not take venue search down.
async function loadBuildingIndex(signal: AbortSignal, fetcher: JsonFetcher): Promise<BuildingIndex> {
  try {
    const catalogue = await loadBuildingCatalogue(signal, fetcher)
    return buildBuildingIndex(catalogue.buildings)
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    console.error('Building catalogue unavailable; continuing without buildings:', error)
    return EMPTY_BUILDING_INDEX
  }
}

export async function loadBuildingCatalogue(
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<BuildingCatalogue> {
  return validateBuildingCatalogue(
    await fetcher('data/buildings.json', signal, 'Building catalogue'),
  )
}

export async function loadTransitMapData(
  signal: AbortSignal,
  fetcher: JsonFetcher = fetchJson,
): Promise<LoadedTransitData> {
  const [networkInput, geometryInput, timingInput] = await Promise.all([
    fetcher('/data/shuttle-network.json', signal, 'bus network'),
    fetcher('/data/shuttle-routes.geojson', signal, 'bus route geometry'),
    fetcher('/data/shuttle-timing.json', signal, 'bus timing'),
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
    await fetcher('/data/shuttle-timing.json', signal, 'bus timing'),
    network,
  )
}

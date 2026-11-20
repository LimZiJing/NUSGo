import { createTransitNetworkIndex } from '../../domain/transit'
import type { LoadedTransitData, LoadedVenueData } from '../../app/contracts/data'
import { validateTransitMapData } from '@nusgo/shared/transit/map-data'
import {
  validateBuildingCatalogue,
  validateVenueSourceMap,
  validateFoodLocationMap,
  composeVenueData,
  getVenueCount,
} from '@nusgo/shared/venue/validation'
import { validateShuttleTimingData } from '@nusgo/shared/transit/timing'
import type { ShuttleTimingData } from '@nusgo/shared/transit/timing'
import type { BuildingCatalogue } from '@nusgo/shared/venue/buildings'
import type { TransitNetwork } from '@nusgo/shared/transit/types'
import { buildBuildingIndex, EMPTY_BUILDING_INDEX } from '../../domain/venue/building-index'
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
  const venueInput = await fetcher('data/venues.json', signal, 'Venue data')
  const roomSources = validateVenueSourceMap(venueInput)
  let foodMap = validateFoodLocationMap({})
  try {
    foodMap = validateFoodLocationMap(
      await fetcher('data/food.json', signal, 'Food data'),
    )
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    console.error('Food data unavailable; continuing without Food locations:', error)
  }
  let buildingCatalogue: BuildingCatalogue | undefined
  try {
    buildingCatalogue = await loadBuildingCatalogue(signal, fetcher)
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    console.error('Building catalogue unavailable; continuing without buildings:', error)
  }

  const venueData = composeVenueData(roomSources, foodMap, buildingCatalogue)
  const buildings = buildingCatalogue
    ? buildBuildingIndex(
      buildingCatalogue.buildings,
      buildingCatalogue.source,
      venueData.wholeBuildingVenueAliases,
    )
    : EMPTY_BUILDING_INDEX
  return {
    venues: venueData.venues,
    venueCount: getVenueCount(venueData.venues),
    buildings,
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

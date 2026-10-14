import type { VenueLocationMap } from '@navus/shared/venue/types'
import { searchBuildings, type BuildingEntry, type BuildingIndex } from './building-index'
import type { BuildingVenueLinks } from './building-links'
import { searchVenues, type VenueSearchResult } from './search'

export type ExploreSearchResult =
  | { readonly kind: 'building'; readonly entry: BuildingEntry }
  | { readonly kind: 'venue'; readonly result: VenueSearchResult }

export interface ExploreSearchSources {
  readonly venues: VenueLocationMap
  readonly buildings: BuildingIndex
  readonly links: BuildingVenueLinks
}

const MAX_RESULTS = 8

/**
 * Find-a-venue search over buildings and rooms. Buildings rank ahead of rooms, as in endpoint
 * search. A venue that is itself a whole building appears once, as that building.
 */
export function searchExplore(
  { venues, buildings, links }: ExploreSearchSources,
  query: string,
  limit = MAX_RESULTS,
): ExploreSearchResult[] {
  const buildingResults = searchBuildings(buildings, query, limit, links.extraNamesByBuildingId)
    .map((entry): ExploreSearchResult => ({ kind: 'building', entry }))
  const rooms = Object.fromEntries(
    Object.entries(venues).filter(([code]) => !links.wholeBuildingVenueCodes.has(code)),
  )
  const roomResults = searchVenues(rooms, query, Math.max(0, limit - buildingResults.length))
    .map((result): ExploreSearchResult => ({ kind: 'venue', result }))

  return [...buildingResults, ...roomResults]
}

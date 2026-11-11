import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import type { BuildingIndex } from './building-index'
import { findExactBuilding } from './building-index'
import { linkVenuesToBuildings } from './building-links'

/** Creates a lookup from an exact building name to the integer floors observed in its rooms. */
export function createBuildingFloorLookup(
  venues: VenueLocationMap | null,
  buildings: BuildingIndex | null,
): (buildingName: string) => readonly number[] | undefined {
  if (!venues || !buildings) return () => undefined

  const links = linkVenuesToBuildings(venues, buildings)
  const floorsByBuilding = new Map<string, Set<number>>()
  for (const [code, venue] of Object.entries(venues)) {
    if (links.wholeBuildingVenueCodes.has(code) || !Number.isSafeInteger(venue.floor)) continue
    const building = links.buildingByVenueCode.get(code)
    if (!building || venue.floor === undefined || venue.floor === null) continue
    const floors = floorsByBuilding.get(building.id) ?? new Set<number>()
    floors.add(venue.floor)
    floorsByBuilding.set(building.id, floors)
  }

  const sortedFloorsByBuilding = new Map(
    [...floorsByBuilding].map(([buildingId, floors]) => [
      buildingId,
      [...floors].sort((first, second) => first - second),
    ]),
  )

  return (buildingName) => {
    const building = findExactBuilding(buildings, buildingName)
    return building ? sortedFloorsByBuilding.get(building.id) : undefined
  }
}

import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import type { BuildingEntry, BuildingIndex } from './building-index'

/** How venues relate to the building catalogue. Computed once per data load. */
export interface BuildingVenueLinks {
  /** Every linked venue, rooms and whole-building venues alike. */
  readonly buildingByVenueCode: ReadonlyMap<string, BuildingEntry>
  /**
   * Venues whose whole code is a building code (for example LT17 or Frontier). They are the
   * building itself, so they show once, as the building, and never as a room inside it.
   */
  readonly wholeBuildingVenueCodes: ReadonlySet<string>
  /** Rooms inside each building, excluding whole-building venues. */
  readonly roomCountByBuildingId: ReadonlyMap<string, number>
  /** Names of whole-building venues, so searching them still finds the building. */
  readonly extraNamesByBuildingId: ReadonlyMap<string, readonly string[]>
}

export const EMPTY_BUILDING_VENUE_LINKS: BuildingVenueLinks = {
  buildingByVenueCode: new Map<string, BuildingEntry>(),
  wholeBuildingVenueCodes: new Set<string>(),
  roomCountByBuildingId: new Map<string, number>(),
  extraNamesByBuildingId: new Map<string, readonly string[]>(),
}

/** The building token of a venue code: the part before the first "-" or "_". */
function roomBuildingToken(venueCode: string): string {
  return venueCode.split(/[-_]/)[0].toLowerCase()
}

export function linkVenuesToBuildings(
  venues: VenueLocationMap,
  buildings: BuildingIndex,
): BuildingVenueLinks {
  const buildingByVenueCode = new Map<string, BuildingEntry>()
  const wholeBuildingVenueCodes = new Set<string>()
  const roomCountByBuildingId = new Map<string, number>()
  const extraNamesByBuildingId = new Map<string, string[]>()

  for (const [code, venue] of Object.entries(venues)) {
    const wholeBuilding = buildings.byRoomCodePrefix.get(code.toLowerCase())
    if (wholeBuilding) {
      buildingByVenueCode.set(code, wholeBuilding)
      wholeBuildingVenueCodes.add(code)
      extraNamesByBuildingId.set(wholeBuilding.id, [
        ...(extraNamesByBuildingId.get(wholeBuilding.id) ?? []),
        venue.roomName,
      ])
      continue
    }

    const building = buildings.byRoomCodePrefix.get(roomBuildingToken(code))
    if (!building) continue
    buildingByVenueCode.set(code, building)
    roomCountByBuildingId.set(building.id, (roomCountByBuildingId.get(building.id) ?? 0) + 1)
  }

  return { buildingByVenueCode, wholeBuildingVenueCodes, roomCountByBuildingId, extraNamesByBuildingId }
}

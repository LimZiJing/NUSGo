import type { VenueMap } from '@nusgo/shared/venue/types'
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
  /** The venue code of each whole-building venue, which is also its NUSMods venue page. */
  readonly nusmodsVenueCodeByBuildingId: ReadonlyMap<string, string>
}

export const EMPTY_BUILDING_VENUE_LINKS: BuildingVenueLinks = {
  buildingByVenueCode: new Map<string, BuildingEntry>(),
  wholeBuildingVenueCodes: new Set<string>(),
  roomCountByBuildingId: new Map<string, number>(),
  extraNamesByBuildingId: new Map<string, readonly string[]>(),
  nusmodsVenueCodeByBuildingId: new Map<string, string>(),
}

export function linkVenuesToBuildings(
  venues: VenueMap,
  buildings: BuildingIndex,
): BuildingVenueLinks {
  const buildingByVenueCode = new Map<string, BuildingEntry>()
  const wholeBuildingVenueCodes = new Set<string>()
  const roomCountByBuildingId = new Map<string, number>()
  const extraNamesByBuildingId = new Map<string, string[]>()
  const nusmodsVenueCodeByBuildingId = new Map<string, string>()

  for (const alias of buildings.wholeBuildingVenueAliases) {
    const building = buildings.byId.get(alias.buildingId)
    if (!building) continue
    buildingByVenueCode.set(alias.venueCode, building)
    wholeBuildingVenueCodes.add(alias.venueCode)
    nusmodsVenueCodeByBuildingId.set(building.id, alias.venueCode)
    extraNamesByBuildingId.set(building.id, [
      ...(extraNamesByBuildingId.get(building.id) ?? []),
      alias.name,
    ])
  }

  for (const [code, venue] of Object.entries(venues)) {
    if (!venue || typeof venue !== 'object') continue
    if (venue.kind === 'food') {
      const building = venue.buildingId ? buildings.byId.get(venue.buildingId) : undefined
      if (building) buildingByVenueCode.set(code, building)
      continue
    }

    const building = venue.buildingId ? buildings.byId.get(venue.buildingId) : undefined
    if (!building) continue
    buildingByVenueCode.set(code, building)
    roomCountByBuildingId.set(building.id, (roomCountByBuildingId.get(building.id) ?? 0) + 1)
  }

  return {
    buildingByVenueCode,
    wholeBuildingVenueCodes,
    roomCountByBuildingId,
    extraNamesByBuildingId,
    nusmodsVenueCodeByBuildingId,
  }
}

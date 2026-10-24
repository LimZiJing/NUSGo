import type { VenueLocation } from '@nusgo/shared/venue/types'

// Names are confirmed by NUS FASS, BBA, Computing, Libraries, the campus map, or OSA.
// Keep unverified prefixes omitted until a published NUS source confirms the alias.
const BUILDING_NAMES_BY_PREFIX: Readonly<Record<string, string>> = Object.freeze({
  AS7: 'The Shaw Foundation Building',
  BIZ1: 'Mochtar Riady Building',
  CLB: 'Central Library',
  COM1: 'Computing 1',
  COM3: 'Computing 3',
  I3: 'I3 Building',
  YIH: 'Yusof Ishak House',
})

export function getVenueBuildingName(code: string): string | undefined {
  const prefix = code.split('-')[0]?.toUpperCase()
  if (!prefix || !Object.prototype.hasOwnProperty.call(BUILDING_NAMES_BY_PREFIX, prefix)) {
    return undefined
  }
  return BUILDING_NAMES_BY_PREFIX[prefix]
}

export function formatVenueFloor(floor: number | null | undefined): string | null {
  if (floor === null || floor === undefined || !Number.isInteger(floor)) return null
  if (floor < 0) return `Basement ${Math.abs(floor)}`
  if (floor === 0) return 'Ground floor'
  return `Floor ${floor}`
}

export function formatVenueFloorAndBuilding(
  floor: number | null | undefined,
  buildingName: string | undefined,
): string | null {
  const floorText = formatVenueFloor(floor)
  const buildingText = buildingName?.trim() || null
  const details = [floorText, buildingText].filter((value): value is string => value !== null)
  return details.length > 0 ? details.join(' · ') : null
}

export function hasVenueCoordinates(venue: VenueLocation): boolean {
  return venue.location !== undefined &&
    Number.isFinite(venue.location.x) &&
    Number.isFinite(venue.location.y)
}

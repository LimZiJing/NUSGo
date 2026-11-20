import type { Venue } from '@nusgo/shared/venue/types'

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

export function hasVenueCoordinates(venue: Venue): boolean {
  return venue.location !== undefined &&
    Number.isFinite(venue.location.x) &&
    Number.isFinite(venue.location.y)
}

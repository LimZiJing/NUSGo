import type { Waypoint } from './waypoint.ts'

export const COMMUNITY_WAYPOINT_CATEGORIES = [
  { value: 'water_cooler', label: 'Water cooler' },
  { value: 'atm', label: 'ATM' },
  { value: 'toilet', label: 'Toilet' },
  { value: 'vending_machine', label: 'Vending machine' },
] as const

// Keep retired values here until published records have been reviewed and migrated.
export const RETIRED_COMMUNITY_WAYPOINT_CATEGORIES = [] as const
export const COMMUNITY_WAYPOINT_READABLE_CATEGORIES = [
  ...COMMUNITY_WAYPOINT_CATEGORIES,
  ...RETIRED_COMMUNITY_WAYPOINT_CATEGORIES,
] as const

export const COMMUNITY_WAYPOINT_TEXT_LIMITS = {
  name: 80,
  source: 160,
  building: 80,
  accessibilityNote: 280,
  details: 500,
} as const

export type ActiveCommunityWaypointCategory = typeof COMMUNITY_WAYPOINT_CATEGORIES[number]['value']
export type CommunityWaypointCategory = typeof COMMUNITY_WAYPOINT_READABLE_CATEGORIES[number]['value']
export type CommunityWaypointId = `cw-${string}`

export interface CommunityWaypoint extends Omit<Waypoint, 'name'> {
  readonly id: CommunityWaypointId
  readonly category: CommunityWaypointCategory
  /** Derived app display label; this is not a public GeoJSON property. */
  readonly displayLabel: string
  readonly source: string
  readonly updatedAt: string
  readonly building?: string
  readonly floor?: number
  readonly accessibilityNote?: string
  readonly details?: string
}

export function getCommunityWaypointCategoryLabel(category: CommunityWaypointCategory): string {
  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.find(({ value }) => value === category)?.label ?? 'Community Waypoint'
}

export function getCommunityWaypointFloorLabel(floor: number): string {
  if (floor === 0) return 'Ground floor'
  if (floor < 0) return `Basement ${Math.abs(floor)}`
  return `Floor ${floor}`
}

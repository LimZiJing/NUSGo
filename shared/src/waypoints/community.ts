import type { Waypoint } from './waypoint.ts'

export const COMMUNITY_WAYPOINT_CATEGORIES = [
  { value: 'water_cooler', label: 'Water cooler' },
  { value: 'printing', label: 'Printing / photocopying' },
  { value: 'toilet', label: 'Toilet' },
  { value: 'vending_machine', label: 'Vending machine' },
] as const

export const COMMUNITY_WAYPOINT_PRINTING_SERVICES = [
  { value: 'print', label: 'Print' },
  { value: 'photocopy', label: 'Photocopy' },
] as const

export const COMMUNITY_WAYPOINT_VENDING_ITEMS = [
  { value: 'drinks', label: 'Drinks' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'meals', label: 'Meals' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'desserts', label: 'Desserts' },
] as const

export const COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS = [
  { value: 'made-to-order', label: 'Made to order' },
  { value: 'pre-packaged', label: 'Pre-packaged' },
  { value: 'microwaved', label: 'Microwaved' },
] as const

// Keep retired values here until published records have been reviewed and migrated.
export const RETIRED_COMMUNITY_WAYPOINT_CATEGORIES = [] as const
export const COMMUNITY_WAYPOINT_READABLE_CATEGORIES = [
  ...COMMUNITY_WAYPOINT_CATEGORIES,
  ...RETIRED_COMMUNITY_WAYPOINT_CATEGORIES,
] as const

export const COMMUNITY_WAYPOINT_TEXT_LIMITS = {
  source: 160,
  building: 80,
  details: 500,
} as const

export type ActiveCommunityWaypointCategory = typeof COMMUNITY_WAYPOINT_CATEGORIES[number]['value']
export type CommunityWaypointCategory = typeof COMMUNITY_WAYPOINT_READABLE_CATEGORIES[number]['value']
export type CommunityWaypointId = `cw-${string}`
export type CommunityWaypointPrintingService = typeof COMMUNITY_WAYPOINT_PRINTING_SERVICES[number]['value']
export type CommunityWaypointVendingItem = typeof COMMUNITY_WAYPOINT_VENDING_ITEMS[number]['value']
export type CommunityWaypointVendingPrep = typeof COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS[number]['value']

export interface PrintingCommunityWaypointDetails {
  readonly services?: readonly CommunityWaypointPrintingService[]
  readonly colour?: boolean
  readonly grayscalePriceCentsPerPage?: number
  readonly colourPriceCentsPerPage?: number
}

export interface VendingCommunityWaypointDetails {
  readonly items?: readonly CommunityWaypointVendingItem[]
  readonly prep?: readonly CommunityWaypointVendingPrep[]
}

/** Complete, unverified category-specific details supplied for reviewer approval. */
export type CommunityWaypointDetailsSuggestion =
  | ({
      readonly category: 'printing'
      readonly services: readonly CommunityWaypointPrintingService[]
      readonly colour: boolean | null
      readonly grayscalePriceCentsPerPage: number | null
      readonly colourPriceCentsPerPage: number | null
    })
  | ({
      readonly category: 'vending_machine'
      readonly items: readonly CommunityWaypointVendingItem[]
      readonly prep: readonly CommunityWaypointVendingPrep[]
    })

export interface CommunityWaypoint extends Omit<Waypoint, 'name'> {
  readonly id: CommunityWaypointId
  readonly category: CommunityWaypointCategory
  /** Derived app display label; this is not a public GeoJSON property. */
  readonly displayLabel: string
  readonly source: string
  readonly updatedAt: string
  readonly building?: string
  readonly floor?: number
  /** Optional reviewer-authored public display text; never accepted in submissions. */
  readonly details?: string
  /** Reviewed, category-specific facts stored as flat GeoJSON properties. */
  readonly services?: readonly CommunityWaypointPrintingService[]
  readonly colour?: boolean
  readonly grayscalePriceCentsPerPage?: number
  readonly colourPriceCentsPerPage?: number
  readonly items?: readonly CommunityWaypointVendingItem[]
  readonly prep?: readonly CommunityWaypointVendingPrep[]
}

export function getCommunityWaypointCategoryLabel(category: CommunityWaypointCategory): string {
  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.find(({ value }) => value === category)?.label ?? 'Community Waypoint'
}

export function getCommunityWaypointFloorLabel(floor: number): string {
  if (floor === 0) return 'Ground floor'
  if (floor < 0) return `Basement ${Math.abs(floor)}`
  return `Floor ${floor}`
}

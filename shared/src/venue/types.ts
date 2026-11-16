export const EATERY_CATEGORIES = ['canteen', 'restaurant', 'drinks & snacks'] as const

export type EateryCategory = typeof EATERY_CATEGORIES[number]

export type GeoLocation = {
  readonly x: number
  readonly y: number
}

export type EateryLocation = {
  readonly name: string
  readonly category: EateryCategory
  readonly location: GeoLocation
}

export type EateryLocationMap = Readonly<Record<string, EateryLocation>>

export type VenueLocation = {
  readonly roomName: string
  /** Present for named campus destinations that are not rooms. */
  readonly displayName?: string
  /** Present for categorized campus eateries. */
  readonly category?: EateryCategory
  /** Runtime merge metadata: true when this eatery has no matching venue-catalogue identity. */
  readonly isStandaloneEatery?: boolean
  readonly floor?: number | null
  readonly location?: GeoLocation
}

export type VenueLocationMap = Readonly<Record<string, VenueLocation>>

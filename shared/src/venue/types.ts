export const FOOD_TYPES = ['canteen', 'restaurant', 'drinks & snacks'] as const

export type FoodType = typeof FOOD_TYPES[number]

export type GeoLocation = {
  readonly x: number
  readonly y: number
}

/** The untagged record shape read from venues.json before the runtime adapter runs. */
export type RoomVenueSource = {
  readonly roomName: string
  readonly floor?: number | null
  readonly location?: GeoLocation
}

export type RoomVenueSourceMap = Readonly<Record<string, RoomVenueSource>>

/** The untagged record shape read from food.json before the runtime adapter runs. */
export type FoodLocation = {
  readonly name: string
  readonly foodType: FoodType
  readonly location: GeoLocation
}

export type FoodLocationMap = Readonly<Record<string, FoodLocation>>

export type RoomVenue = {
  readonly kind: 'room'
  readonly roomName: string
  readonly floor?: number | null
  readonly location?: GeoLocation
  readonly buildingId?: string
}

export type FoodVenue = {
  readonly kind: 'food'
  readonly name: string
  readonly location: GeoLocation
  readonly foodType: FoodType
  readonly buildingId?: string
}

export type Venue = RoomVenue | FoodVenue

export type VenueMap = Readonly<Record<string, Venue>>

/** A source venue identity that remains searchable as a Building instead of a Room. */
export type WholeBuildingVenueAlias = {
  readonly venueCode: string
  readonly name: string
  readonly buildingId: string
}

export type ComposedVenueData = {
  readonly venues: VenueMap
  readonly wholeBuildingVenueAliases: readonly WholeBuildingVenueAlias[]
}

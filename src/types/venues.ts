// Venue shape adapted from NUSMods venue data:
// https://github.com/nusmodifications/nusmods/blob/master/website/src/types/venues.ts

export type VenueLocation = {
  readonly roomName: string
  readonly floor?: number | string | null
  readonly location?: {
    readonly x: number
    readonly y: number
  }
}

export type VenueLocationMap = Record<string, VenueLocation>

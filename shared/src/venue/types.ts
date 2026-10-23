export type VenueLocation = {
  readonly roomName: string
  readonly floor?: number | null
  readonly location?: {
    readonly x: number
    readonly y: number
  }
}

export type VenueLocationMap = Readonly<Record<string, VenueLocation>>

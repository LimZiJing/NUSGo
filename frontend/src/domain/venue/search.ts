import type { VenueLocation, VenueLocationMap } from '@navus/shared/venue/types'

export interface VenueSearchResult {
  readonly code: string
  readonly venue: VenueLocation
}

const MAX_RESULTS = 8

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function resultPriority(code: string, roomName: string, query: string): number {
  const normalizedCode = normalize(code)
  const normalizedRoomName = normalize(roomName)

  if (normalizedCode === query) return 0
  if (normalizedCode.startsWith(query)) return 1
  if (normalizedRoomName.startsWith(query)) return 2
  return 3
}

export function searchVenues(
  venues: VenueLocationMap,
  query: string,
  limit = MAX_RESULTS,
): VenueSearchResult[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  return Object.entries(venues)
    .filter(([code, venue]) => {
      const normalizedCode = normalize(code)
      const normalizedRoomName = normalize(venue.roomName)
      return (
        normalizedCode.includes(normalizedQuery) ||
        normalizedRoomName.includes(normalizedQuery)
      )
    })
    .sort(([codeA, venueA], [codeB, venueB]) => {
      const priorityDifference =
        resultPriority(codeA, venueA.roomName, normalizedQuery) -
        resultPriority(codeB, venueB.roomName, normalizedQuery)
      return priorityDifference || codeA.localeCompare(codeB)
    })
    .slice(0, limit)
    .map(([code, venue]) => ({ code, venue }))
}

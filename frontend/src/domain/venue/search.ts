import type { Venue, VenueMap } from '@nusgo/shared/venue/types'
import { getFoodTypeLabel } from './food'
import { compareText, getMatchPriority, normalizeSearchText } from '../text-match'

export interface VenueSearchResult {
  readonly code: string
  readonly venue: Venue
}

export interface VenueSearchPresentation {
  readonly title: string
  readonly detail: string
}

/** Shared titles and details for Find venue and Plan. */
export function getVenueSearchPresentation(code: string, venue: Venue): VenueSearchPresentation {
  if (venue.kind === 'food') {
    return { title: venue.name, detail: getFoodTypeLabel(venue.foodType) }
  }
  return { title: code, detail: venue.roomName }
}

/** Every venue is searchable by its stable ID and its public Room or Food name. */
export function getVenueSearchFields(code: string, venue: Venue): string[] {
  return venue.kind === 'food' ? [code, venue.name] : [code, venue.roomName]
}

const MAX_RESULTS = 8

export function searchVenues(
  venues: VenueMap,
  query: string,
  limit = MAX_RESULTS,
): VenueSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return Object.entries(venues)
    .map(([code, venue]) => ({
      code,
      venue,
      fields: getVenueSearchFields(code, venue),
      priority: getMatchPriority(getVenueSearchFields(code, venue), normalizedQuery),
    }))
    .filter((result): result is typeof result & { priority: number } => result.priority !== null)
    .sort((first, second) => {
      return first.priority - second.priority || compareText(first.code, second.code)
    })
    .slice(0, limit)
    .map(({ code, venue }) => ({ code, venue }))
}

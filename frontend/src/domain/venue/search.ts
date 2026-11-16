import type { VenueLocation, VenueLocationMap } from '@nusgo/shared/venue/types'
import { normalizeSearchText } from '../text-match'

export interface VenueSearchResult {
  readonly code: string
  readonly venue: VenueLocation
}

/** Every name a venue can be found by: its code, display name and existing room name. */
export function getVenueSearchFields(code: string, venue: VenueLocation): string[] {
  const names = [...new Set([venue.displayName, venue.roomName].filter(
    (name): name is string => Boolean(name),
  ))]
  return [code, ...names]
}

const MAX_RESULTS = 8

function resultPriority(fields: readonly string[], query: string): number {
  const [code, ...names] = fields
  const normalizedCode = normalizeSearchText(code ?? '')

  if (normalizedCode === query) return 0
  if (normalizedCode.startsWith(query)) return 1
  if (names.some((name) => normalizeSearchText(name).startsWith(query))) return 2
  return 3
}

export function searchVenues(
  venues: VenueLocationMap,
  query: string,
  limit = MAX_RESULTS,
): VenueSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return Object.entries(venues)
    .map(([code, venue]) => ({ code, venue, fields: getVenueSearchFields(code, venue) }))
    .filter(({ fields }) => fields.some((field) => normalizeSearchText(field).includes(normalizedQuery)))
    .sort((first, second) => {
      const priorityDifference =
        resultPriority(first.fields, normalizedQuery) - resultPriority(second.fields, normalizedQuery)
      return priorityDifference || first.code.localeCompare(second.code)
    })
    .slice(0, limit)
    .map(({ code, venue }) => ({ code, venue }))
}

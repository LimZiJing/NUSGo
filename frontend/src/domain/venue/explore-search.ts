import type { TransitStop } from '@nusgo/shared/transit/types'
import type { VenueMap } from '@nusgo/shared/venue/types'
import type { TransitIndex } from '../transit'
import { compareText, getMatchPriority, normalizeSearchText } from '../text-match'
import { getBuildingSearchFields, type BuildingEntry, type BuildingIndex } from './building-index'
import type { BuildingVenueLinks } from './building-links'
import { getVenueSearchFields, getVenueSearchPresentation, type VenueSearchResult } from './search'

export type ExploreResultFilter = 'all' | 'food' | 'room' | 'building' | 'stop'

export type ExploreSearchResult =
  | { readonly kind: 'stop'; readonly stop: TransitStop }
  | { readonly kind: 'building'; readonly entry: BuildingEntry }
  | { readonly kind: 'venue'; readonly result: VenueSearchResult }

export interface ExploreSearchSources {
  readonly venues: VenueMap
  readonly buildings: BuildingIndex
  readonly links: BuildingVenueLinks
  /** Bus stops to match by ID or name. Omitted or null means no stops are searched. */
  readonly stops?: TransitIndex | readonly TransitStop[] | null
}

const MAX_RESULTS = 8

// Only used to break ties between results with the same match priority.
const KIND_ORDER = { stop: 0, building: 1, venue: 2 } as const

interface Candidate {
  readonly result: ExploreSearchResult
  readonly fields: readonly string[]
  readonly kindOrder: number
  readonly label: string
  /** Stable key within a kind: stop ID, building ID or venue code. */
  readonly key: string
}

function matchesFilter(candidate: Candidate, filter: ExploreResultFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'stop' || filter === 'building') return candidate.result.kind === filter
  return candidate.result.kind === 'venue' && candidate.result.result.venue.kind === filter
}

function getStops(source: ExploreSearchSources['stops']): readonly TransitStop[] {
  if (source === null || source === undefined) return []
  return 'stops' in source ? source.stops : source
}

/**
 * Find-a-venue search over bus stops, buildings, rooms and foods. Queries rank by match quality
 * first (exact, then prefix, then partial), then stops before buildings before rooms and foods, then
 * by key. An empty query browses a selected kind alphabetically. A room that is itself a whole
 * building appears once, as that building; foods keep their own results. Venues without coordinates
 * are still returned.
 */
export function searchExplore(
  { venues, buildings, links, stops }: ExploreSearchSources,
  query: string,
  filter: ExploreResultFilter = 'all',
  limit = MAX_RESULTS,
): ExploreSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery && filter === 'all') return []

  const candidates: Candidate[] = []

  for (const stop of getStops(stops)) {
    candidates.push({
      result: { kind: 'stop', stop },
      fields: [stop.id, stop.longName, stop.shortName],
      kindOrder: KIND_ORDER.stop,
      label: stop.longName,
      key: stop.id,
    })
  }

  for (const entry of buildings.entries) {
    candidates.push({
      result: { kind: 'building', entry },
      fields: getBuildingSearchFields(entry, links.extraNamesByBuildingId),
      kindOrder: KIND_ORDER.building,
      label: entry.name,
      key: entry.id,
    })
  }

  for (const [code, venue] of Object.entries(venues)) {
    if (venue.kind === 'room' && links.wholeBuildingVenueCodes.has(code)) continue
    candidates.push({
      result: { kind: 'venue', result: { code, venue } },
      fields: getVenueSearchFields(code, venue),
      kindOrder: KIND_ORDER.venue,
      label: getVenueSearchPresentation(code, venue).title,
      key: code,
    })
  }

  const filteredCandidates = candidates.filter((candidate) => matchesFilter(candidate, filter))
  if (!normalizedQuery) {
    return filteredCandidates
      .sort((first, second) =>
        compareText(normalizeSearchText(first.label), normalizeSearchText(second.label)) ||
        compareText(first.key, second.key),
      )
      .slice(0, Math.max(0, limit))
      .map((candidate) => candidate.result)
  }

  const matches: Array<{ readonly candidate: Candidate; readonly priority: number }> = []
  for (const candidate of filteredCandidates) {
    const priority = getMatchPriority(candidate.fields, normalizedQuery)
    if (priority !== null) matches.push({ candidate, priority })
  }

  return matches
    .sort((first, second) =>
      first.priority - second.priority ||
      first.candidate.kindOrder - second.candidate.kindOrder ||
      compareText(first.candidate.key, second.candidate.key),
    )
    .slice(0, Math.max(0, limit))
    .map((match) => match.candidate.result)
}

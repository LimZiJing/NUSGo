import type { Building } from '@navus/shared/venue/buildings'
import { compareText, getMatchPriority, normalizeSearchText } from '../text-match'

/**
 * One searchable building result. Parts that share a group key (for example the five
 * Cendana College buildings) collapse into one entry; each part keeps its own ID.
 */
export interface BuildingEntry {
  /** The building's own ID, or the group key when it represents several parts. */
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  /** Ordered by building ID so results are deterministic. */
  readonly parts: readonly Building[]
  /**
   * Where the entry resolves as a journey endpoint: the building's own location, or for a group
   * the part nearest the centre of all parts, so no point is ever invented.
   */
  readonly location: Building['location']
  readonly locationKind: NonNullable<Building['locationKind']>
}

export interface BuildingIndex {
  readonly entries: readonly BuildingEntry[]
  readonly byId: ReadonlyMap<string, BuildingEntry>
}

export const EMPTY_BUILDING_INDEX: BuildingIndex = Object.freeze({ entries: [], byId: new Map() })

function pickRepresentativePart(parts: readonly Building[]): Building {
  const centreX = parts.reduce((total, part) => total + part.location.x, 0) / parts.length
  const centreY = parts.reduce((total, part) => total + part.location.y, 0) / parts.length
  const distance = (part: Building) =>
    (part.location.x - centreX) ** 2 + (part.location.y - centreY) ** 2

  // parts are already ordered by ID, so ties keep the lowest ID.
  return parts.reduce((best, part) => (distance(part) < distance(best) ? part : best))
}

function toEntry(id: string, parts: readonly Building[]): BuildingEntry {
  const ordered = [...parts].sort((first, second) => compareText(first.id, second.id))
  const representative = pickRepresentativePart(ordered)
  return {
    id,
    name: ordered[0].name,
    aliases: [...new Set(ordered.flatMap((part) => part.aliases))],
    parts: ordered,
    location: representative.location,
    locationKind: representative.locationKind ?? 'centroid',
  }
}

export function buildBuildingIndex(buildings: readonly Building[]): BuildingIndex {
  const groups = new Map<string, Building[]>()
  const entries: BuildingEntry[] = []

  for (const building of buildings) {
    if (building.groupKey === undefined) {
      entries.push(toEntry(building.id, [building]))
      continue
    }
    const group = groups.get(building.groupKey)
    if (group) group.push(building)
    else groups.set(building.groupKey, [building])
  }

  for (const [groupKey, parts] of groups) entries.push(toEntry(groupKey, parts))

  const sorted = entries.sort((first, second) => compareText(first.id, second.id))
  return { entries: sorted, byId: new Map(sorted.map((entry) => [entry.id, entry])) }
}

const MAX_RESULTS = 8

export function searchBuildings(
  index: BuildingIndex,
  query: string,
  limit = MAX_RESULTS,
): BuildingEntry[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return index.entries
    .map((entry) => ({ entry, priority: getMatchPriority([entry.name, ...entry.aliases], normalizedQuery) }))
    .filter((match): match is { entry: BuildingEntry; priority: number } => match.priority !== null)
    .sort((first, second) => first.priority - second.priority || compareText(first.entry.id, second.entry.id))
    .slice(0, Math.max(0, limit))
    .map((match) => match.entry)
}

import type { Building } from '@navus/shared/venue/buildings'

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
}

export interface BuildingIndex {
  readonly entries: readonly BuildingEntry[]
}

export const EMPTY_BUILDING_INDEX: BuildingIndex = Object.freeze({ entries: [] })

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function toEntry(id: string, parts: readonly Building[]): BuildingEntry {
  const ordered = [...parts].sort((first, second) => compareText(first.id, second.id))
  return {
    id,
    name: ordered[0].name,
    aliases: [...new Set(ordered.flatMap((part) => part.aliases))],
    parts: ordered,
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

  return { entries: entries.sort((first, second) => compareText(first.id, second.id)) }
}

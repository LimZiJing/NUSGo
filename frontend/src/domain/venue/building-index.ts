import type { Building, BuildingCatalogueSource } from '@navus/shared/venue/buildings'
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
  /** The navigable buildings: parts without the main-entrance record. Same as parts when none is marked. */
  readonly buildings: readonly Building[]
  /** The record marked as the group's main entrance, if any. */
  readonly entrance?: Building
  /** Every block number of the group, in display order (for example ["15", "16", "17", "18", "19"]). */
  readonly blocks: readonly string[]
  /** Compact summary of blocks, for example "Blocks 15-19"; undefined when no block is recorded. */
  readonly blockLabel?: string
  /**
   * Where the entry resolves as a journey endpoint: the building's own location, or for a group
   * the part nearest the centre of all parts, so no point is ever invented.
   */
  readonly location: Building['location']
  readonly locationKind: NonNullable<Building['locationKind']>
}

export interface BuildingIndex {
  /** Provenance from the validated catalogue, when it was loaded from the data source. */
  readonly source?: BuildingCatalogueSource
  readonly entries: readonly BuildingEntry[]
  readonly byId: ReadonlyMap<string, BuildingEntry>
  /**
   * Each building record of a group by its own ID, so a journey can target one building of a group.
   * Holds only IDs that are not already an entry ID.
   */
  readonly byPartId: ReadonlyMap<string, { readonly entry: BuildingEntry; readonly part: Building }>
  /** Lower-case room-code prefix (for example "com1") to the entry whose rooms use it. */
  readonly byRoomCodePrefix: ReadonlyMap<string, BuildingEntry>
}

export const EMPTY_BUILDING_INDEX: BuildingIndex = Object.freeze({ entries: [], byId: new Map(), byPartId: new Map(), byRoomCodePrefix: new Map() })

function pickRepresentativePart(parts: readonly Building[]): Building {
  const centreX = parts.reduce((total, part) => total + part.location.x, 0) / parts.length
  const centreY = parts.reduce((total, part) => total + part.location.y, 0) / parts.length
  const distance = (part: Building) =>
    (part.location.x - centreX) ** 2 + (part.location.y - centreY) ** 2

  // parts are already ordered by ID, so ties keep the lowest ID.
  return parts.reduce((best, part) => (distance(part) < distance(best) ? part : best))
}

function blockOrder(first: string, second: string): number {
  const a = Number(first)
  const b = Number(second)
  return Number.isNaN(a) || Number.isNaN(b) ? compareText(first, second) : a - b
}

/** "Blocks 15-19", "Block 5", "Blocks 1, 3" or "Blocks A-H"; consecutive numbers or letters collapse. */
export function formatBlockLabel(blocks: readonly string[]): string | undefined {
  if (blocks.length === 0) return undefined
  const code = (block: string) => (/^\d+$/.test(block) ? Number(block) : block.length === 1 ? block.charCodeAt(0) : NaN)
  const runs: string[][] = []
  for (const block of blocks) {
    const run = runs[runs.length - 1]
    const previous = run?.[run.length - 1]
    if (run && previous !== undefined && code(block) === code(previous) + 1 && /^\d+$/.test(block) === /^\d+$/.test(previous)) run.push(block)
    else runs.push([block])
  }
  const text = runs.map((run) => (run.length > 1 ? `${run[0]}-${run[run.length - 1]}` : run.join(', '))).join(', ')
  return `${blocks.length === 1 ? 'Block' : 'Blocks'} ${text}`
}

function toEntry(id: string, parts: readonly Building[]): BuildingEntry {
  const ordered = [...parts].sort((first, second) => compareText(first.id, second.id))
  const entrance = ordered.find((part) => part.groupRole === 'entrance')
  const buildings = ordered.filter((part) => part !== entrance)
  const blocks = [...new Set(buildings.flatMap((part) => part.blocks ?? []))].sort(blockOrder)
  // The main entrance wins; otherwise the building nearest the centre.
  const representative = entrance ?? pickRepresentativePart(buildings)
  return {
    id,
    name: (entrance ?? ordered[0]).name,
    aliases: [...new Set(ordered.flatMap((part) => part.aliases))],
    parts: ordered,
    buildings,
    ...(entrance === undefined ? {} : { entrance }),
    blocks,
    ...(formatBlockLabel(blocks) === undefined ? {} : { blockLabel: formatBlockLabel(blocks) }),
    location: representative.location,
    locationKind: representative.locationKind ?? 'centroid',
  }
}

export function buildBuildingIndex(
  buildings: readonly Building[],
  source?: BuildingCatalogueSource,
): BuildingIndex {
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
  const byRoomCodePrefix = new Map<string, BuildingEntry>()
  const byPartId = new Map<string, { entry: BuildingEntry; part: Building }>()
  const entryIds = new Set(sorted.map((entry) => entry.id))
  for (const entry of sorted) {
    for (const part of entry.parts) {
      if (!entryIds.has(part.id)) byPartId.set(part.id, { entry, part })
      for (const prefix of part.roomCodePrefixes) byRoomCodePrefix.set(prefix.toLowerCase(), entry)
    }
  }
  return {
    ...(source === undefined ? {} : { source }),
    entries: sorted,
    byId: new Map(sorted.map((entry) => [entry.id, entry])),
    byPartId,
    byRoomCodePrefix,
  }
}

/** The location a building endpoint resolves to: a whole entry, or one building of a group. */
export function resolveBuildingLocation(index: BuildingIndex, id: string): Building['location'] | undefined {
  return index.byId.get(id)?.location ?? index.byPartId.get(id)?.part.location
}

/** Secondary line for a result: the building count and block range for a group, else the address (after any block range). */
export function describeBuildingEntry(entry: BuildingEntry): string {
  if (entry.buildings.length > 1) {
    return entry.blockLabel === undefined
      ? `${entry.buildings.length} buildings`
      : `${entry.buildings.length} buildings · ${entry.blockLabel}`
  }
  const address = entry.buildings[0]?.address ?? entry.entrance?.address ?? ''
  // A single building that spans several blocks (for example Blocks 5-8) still names them.
  return entry.blockLabel === undefined ? address : [entry.blockLabel, address].filter(Boolean).join(' · ')
}

const MAX_RESULTS = 8

/** Searchable names for each block, so "Block 16" and "Helix House Block 16" find the group. */
function blockNames(entry: BuildingEntry): string[] {
  return entry.blocks.flatMap((block) => [`Block ${block}`, `${entry.name} Block ${block}`])
}

/** Every name a building entry can be found by: its name, aliases, block names and any extra names. */
export function getBuildingSearchFields(
  entry: BuildingEntry,
  extraNames: ReadonlyMap<string, readonly string[]>,
): string[] {
  return [entry.name, ...entry.aliases, ...blockNames(entry), ...(extraNames.get(entry.id) ?? [])]
}

export function searchBuildings(
  index: BuildingIndex,
  query: string,
  limit = MAX_RESULTS,
  /** Extra searchable names per entry ID, such as the room name of a whole-building venue. */
  extraNames: ReadonlyMap<string, readonly string[]> = new Map(),
): BuildingEntry[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return index.entries
    .map((entry) => ({ entry, priority: getMatchPriority(getBuildingSearchFields(entry, extraNames), normalizedQuery) }))
    .filter((match): match is { entry: BuildingEntry; priority: number } => match.priority !== null)
    .sort((first, second) => first.priority - second.priority || compareText(first.entry.id, second.entry.id))
    .slice(0, Math.max(0, limit))
    .map((match) => match.entry)
}

import type {
  Building,
  BuildingCatalogue,
  BuildingCatalogueSource,
} from '../../../shared/src/venue/buildings.ts'
import type { VenueLocationMap } from '../../../shared/src/venue/types.ts'
import type { BuildingAlias } from './aliases.ts'
import { candidateCodes, compactName, normaliseName, roomBuildingToken, slugify } from './normalise.ts'
import type { BuildingOverride, BuildingOverrides } from './overrides.ts'
import type { ApiBuilding } from './snapshot.ts'

/** Approved sanity-check radius (#332): a match further than this from its rooms is flagged. */
export const DISTANCE_WARNING_METRES = 150

export type LinkRule = 'override' | 'code' | 'alias' | 'name'

export type PrefixLink = {
  readonly prefix: string
  readonly buildingId: string
  readonly rule: LinkRule
  readonly roomCount: number
}

export type AmbiguousMatch = {
  readonly prefix: string
  readonly rule: Exclude<LinkRule, 'override'>
  readonly buildingIds: readonly string[]
}

export type UnlinkedPrefix = {
  readonly prefix: string
  readonly roomCount: number
  /** Why the prefix may not be a building token; a hint for review only. */
  readonly note?: string
  /** Nearest building to the rooms' median point; a hint for review, never a link. */
  readonly nearest?: { readonly buildingId: string, readonly metres: number }
}

export type DistanceWarning = {
  readonly prefix: string
  readonly buildingId: string
  readonly metres: number
}

export type RepeatedName = {
  readonly name: string
  readonly groupKey: string
  readonly buildingIds: readonly string[]
  readonly addresses: readonly string[]
}

export type StandaloneCandidate = {
  readonly venueCode: string
  readonly reason: 'matches a building code' | 'no room structure'
}

export type ImportCounts = {
  readonly apiRecords: number
  readonly buildingsWritten: number
  readonly roomsLinked: number
  readonly roomsUnlinked: number
}

export type ImportFindings = {
  readonly counts: ImportCounts
  readonly links: readonly PrefixLink[]
  readonly ambiguous: readonly AmbiguousMatch[]
  readonly unlinkedPrefixes: readonly UnlinkedPrefix[]
  readonly distanceWarnings: readonly DistanceWarning[]
  readonly repeatedNames: readonly RepeatedName[]
  readonly standaloneCandidates: readonly StandaloneCandidate[]
  /** Building ids with no linked rooms. */
  readonly buildingsWithoutRooms: readonly string[]
  /** API records that share exactly the same coordinates, which may be duplicates. */
  readonly sharedCoordinates: readonly (readonly string[])[]
  /** Alias entries that no longer fit the data (renamed building, retired prefix). */
  readonly staleAliases: readonly string[]
  /** API records folded into another building by a mergeInto override; they write no building. */
  readonly merged: readonly MergedRecord[]
  readonly dataIssues: readonly string[]
}

export type MergedRecord = {
  readonly name: string
  readonly elementId: string
  /** Id of the surviving building the record was folded into. */
  readonly buildingId: string
}

export type BuildCatalogueInput = {
  readonly apiBuildings: readonly ApiBuilding[]
  readonly venues: VenueLocationMap
  readonly aliases: readonly BuildingAlias[]
  readonly overrides: BuildingOverrides
  /** Prefixes deliberately left unlinked, with the reason (from the overrides file). */
  readonly intentionallyUnlinked?: Readonly<Record<string, string>>
  readonly source: BuildingCatalogueSource
}

export type BuildCatalogueResult = {
  readonly catalogue: BuildingCatalogue
  readonly findings: ImportFindings
}

type Point = { readonly x: number, readonly y: number }

type Draft = {
  readonly api: ApiBuilding
  readonly override: BuildingOverride | undefined
  readonly id: string
  readonly name: string
  readonly normalisedName: string
  readonly groupKey: string | undefined
  readonly partLabel: string | undefined
  readonly blocks: readonly string[] | undefined
  readonly groupRole: 'entrance' | undefined
  readonly codes: readonly string[]
  readonly location: Point
  /** Names of API records merged into this one; appended to its aliases, always. */
  readonly mergedNames: readonly string[]
  readonly prefixes: Set<string>
  readonly linkedAliases: Set<string>
}

/** An API record with a mergeInto override, and the elementId it folds into. */
type MergeAway = { readonly api: ApiBuilding, readonly targetElementId: string }

type PrefixRooms = {
  readonly prefix: string
  readonly codes: readonly string[]
  readonly median: Point | undefined
}

type RuleOutcome =
  | { readonly kind: 'linked', readonly draft: Draft, readonly rule: LinkRule }
  | { readonly kind: 'ambiguous', readonly drafts: readonly Draft[], readonly rule: AmbiguousMatch['rule'] }
  | { readonly kind: 'none' }

/** Names that are only a code (COM1, LT 1, SDE2) are matched by code, never by the name rule. */
const CODE_ONLY_NAME = /^[a-z]+\d+[a-z]?$/
const CODE_PATTERN = /^([A-Za-z]+) ?(\d+[A-Za-z]?)$/

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function uniqueSorted(values: readonly string[], exclude = ''): string[] {
  return [...new Set(values.map((value) => value.trim()))]
    .filter((value) => value.length > 0 && value !== exclude)
    .sort(byString)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function distanceMetres(a: Point, b: Point): number {
  const radians = Math.PI / 180
  const dLat = (b.y - a.y) * radians
  const dLon = (b.x - a.x) * radians
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.y * radians) * Math.cos(b.y * radians) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * Readable ids from the API name (not the override name, so a rename keeps the id). Names that
 * slug alike get -1, -2, ... in elementId order. A new record with the same name in a later
 * snapshot can renumber them; pin ids in a registry if that ever matters.
 */
function assignIds(apiBuildings: readonly ApiBuilding[]): Map<string, string> {
  const bySlug = new Map<string, ApiBuilding[]>()
  for (const api of apiBuildings) {
    const slug = slugify(api.name)
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), api])
  }
  const ids = new Map<string, string>()
  for (const [slug, members] of bySlug) {
    if (members.length === 1) {
      ids.set(members[0].elementId, slug)
      continue
    }
    ;[...members]
      .sort((a, b) => byString(a.elementId, b.elementId))
      .forEach((api, index) => ids.set(api.elementId, `${slug}-${index + 1}`))
  }
  const taken = new Set<string>()
  for (const id of ids.values()) {
    if (taken.has(id)) throw new Error(`Building id ${id} would be generated twice; add a distinguishing override name`)
    taken.add(id)
  }
  return ids
}

function mergeAways(input: BuildCatalogueInput): MergeAway[] {
  return input.apiBuildings
    .flatMap((api): MergeAway[] => {
      const targetElementId = input.overrides[api.elementId]?.mergeInto
      return targetElementId === undefined ? [] : [{ api, targetElementId }]
    })
    .sort((a, b) => byString(a.api.elementId, b.api.elementId))
}

/**
 * Ids come from all API records so surviving ids never move when a duplicate is merged away.
 * Merged records are left out before name counting, so they cannot create or keep a same-name group.
 */
function createDrafts(input: BuildCatalogueInput, merges: readonly MergeAway[], ids: ReadonlyMap<string, string>): Draft[] {
  const mergedAway = new Set(merges.map((merge) => merge.api.elementId))
  const named = input.apiBuildings.filter((api) => !mergedAway.has(api.elementId)).map((api) => {
    const override = input.overrides[api.elementId]
    const name = override?.name ?? api.name
    return { api, override, name, normalisedName: normaliseName(name) }
  })
  for (const merge of merges) {
    if (!named.some(({ api }) => api.elementId === merge.targetElementId)) {
      throw new Error(`Override ${merge.api.elementId} merges into ${merge.targetElementId}, which is not a surviving building`)
    }
  }
  const nameCounts = new Map<string, number>()
  for (const { normalisedName } of named) {
    nameCounts.set(normalisedName, (nameCounts.get(normalisedName) ?? 0) + 1)
  }
  return named.map(({ api, override, name, normalisedName }): Draft => ({
    api,
    override,
    id: ids.get(api.elementId) as string,
    name,
    normalisedName,
    groupKey: override?.groupKey ?? ((nameCounts.get(normalisedName) ?? 0) > 1 ? slugify(name) : undefined),
    partLabel: override?.partLabel,
    blocks: override?.blocks,
    groupRole: override?.groupRole,
    codes: candidateCodes(name),
    location: override?.entrance
      ? { x: override.entrance.x, y: override.entrance.y }
      : override?.location ?? { x: api.longitude, y: api.latitude },
    mergedNames: merges.filter((merge) => merge.targetElementId === api.elementId).map((merge) => merge.api.name),
    prefixes: new Set(),
    linkedAliases: new Set(),
  }))
}

function groupRoomsByPrefix(venues: VenueLocationMap): PrefixRooms[] {
  const groups = new Map<string, string[]>()
  for (const code of Object.keys(venues).sort(byString)) {
    const prefix = roomBuildingToken(code)
    groups.set(prefix, [...(groups.get(prefix) ?? []), code])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byString(a, b))
    .map(([prefix, codes]) => {
      const points = codes.flatMap((code) => venues[code].location ?? [])
      const point = points.length === 0
        ? undefined
        : { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)) }
      return { prefix, codes, median: point }
    })
}

function outcome(matches: readonly Draft[], rule: AmbiguousMatch['rule']): RuleOutcome {
  if (matches.length === 1) return { kind: 'linked', draft: matches[0], rule }
  if (matches.length > 1) return { kind: 'ambiguous', drafts: matches, rule }
  return { kind: 'none' }
}

/**
 * Only multi-word descriptive names take part in name matching: code-only names (COM1, LT 1)
 * are the code rule's job, and single words ("Create", "Frontier") are too generic to trust.
 */
function isDescriptiveName(normalisedName: string): boolean {
  return normalisedName.includes(' ') && !CODE_ONLY_NAME.test(normalisedName.replace(/ /g, ''))
}

/** The building whose descriptive name is the longest word-prefix of the room name, if any. */
function nameMatches(roomName: string, drafts: readonly Draft[]): Draft[] {
  const normalisedRoom = normaliseName(roomName)
  const matches = drafts.filter((draft) => (
    isDescriptiveName(draft.normalisedName) &&
    (normalisedRoom === draft.normalisedName || normalisedRoom.startsWith(`${draft.normalisedName} `))
  ))
  const longest = Math.max(0, ...matches.map((draft) => draft.normalisedName.length))
  return matches.filter((draft) => draft.normalisedName.length === longest)
}

function linkPrefix(
  rooms: PrefixRooms,
  drafts: readonly Draft[],
  aliases: ReadonlyMap<string, BuildingAlias>,
  venues: VenueLocationMap,
): RuleOutcome {
  const compact = compactName(rooms.prefix)
  const overridden = drafts.filter((draft) => (
    draft.override?.roomCodePrefixes?.some((prefix) => compactName(prefix) === compact)
  ))
  if (overridden.length > 0) return { kind: 'linked', draft: overridden[0], rule: 'override' }
  // Buildings whose prefixes are set by an override take no computed links.
  const open = drafts.filter((draft) => draft.override?.roomCodePrefixes === undefined)

  const byCode = outcome(open.filter((draft) => draft.codes.includes(compact)), 'code')
  if (byCode.kind !== 'none') return byCode

  const alias = aliases.get(compact)
  if (alias) {
    const target = normaliseName(alias.name)
    const byAlias = outcome(open.filter((draft) => draft.normalisedName === target), 'alias')
    if (byAlias.kind !== 'none') return byAlias
  }

  const named = new Set(rooms.codes.flatMap((code) => nameMatches(venues[code].roomName, open)))
  return outcome([...named].sort((a, b) => byString(a.id, b.id)), 'name')
}

function codeVariants(token: string): string[] {
  const match = CODE_PATTERN.exec(token.trim())
  if (!match) return []
  const [, letters, digits] = match
  // A spaced form helps "COM 1" searches; "E 1" or "S 1A" would only add noise.
  return letters.length > 1 ? [`${letters} ${digits}`, `${letters}${digits}`] : [`${letters}${digits}`]
}

/** Search-only aliases derived from the code forms in a building name. */
function nameAliases(name: string): string[] {
  const aliases = codeVariants(name)
  const dash = name.indexOf(' - ')
  if (dash > 0) aliases.push(...codeVariants(name.slice(0, dash)), name.slice(dash + 3))
  const parenthesis = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name)
  if (parenthesis) {
    const codes = parenthesis[2].split('/').flatMap(codeVariants)
    if (codes.length > 0) aliases.push(parenthesis[1], ...codes)
  }
  return aliases
}

function toBuilding(draft: Draft): Building {
  const { api, override } = draft
  const postal = /^\d{6}$/.test(api.postal) ? api.postal : undefined
  const address = api.address.trim() || undefined
  const ownAliases = override?.aliases ?? [...nameAliases(draft.name), ...draft.linkedAliases]
  const aliases = [...ownAliases, ...draft.mergedNames.flatMap((name) => [name, ...nameAliases(name)])]
  return {
    id: draft.id,
    name: draft.name,
    aliases: uniqueSorted(aliases, draft.name),
    elementId: api.elementId,
    ...(draft.groupKey === undefined ? {} : { groupKey: draft.groupKey }),
    ...(draft.partLabel === undefined ? {} : { partLabel: draft.partLabel }),
    ...(draft.blocks === undefined ? {} : { blocks: [...draft.blocks] }),
    ...(draft.groupRole === undefined ? {} : { groupRole: draft.groupRole }),
    ...(address === undefined ? {} : { address }),
    ...(postal === undefined ? {} : { postal }),
    location: { x: draft.location.x, y: draft.location.y },
    // A hand-set override location is no longer the API centroid.
    ...(override?.entrance === undefined && override?.location === undefined
      ? { locationKind: 'centroid' as const }
      : {}),
    ...(override?.entrance === undefined ? {} : { locationKind: 'provisional-entrance' as const }),
    roomCodePrefixes: uniqueSorted([...(override?.roomCodePrefixes ?? []), ...draft.prefixes]),
    sourceRefs: [
      { source: 'nus-digital-twin', elementId: api.elementId },
      ...(override?.entrance === undefined
        ? []
        : [{ source: 'openstreetmap', elementId: `node/${override.entrance.osmNode}` }]),
    ],
  }
}

function prefixNote(prefix: string, drafts: readonly Draft[]): string | undefined {
  if (/[^A-Za-z0-9_-]/.test(prefix)) return 'contains characters that are not used in building codes'
  const compact = compactName(prefix)
  const codes = drafts
    .flatMap((draft) => draft.codes)
    // At least two letters must follow, so LT35 (not LT3 + 5) and LT7A (a variant) are not flagged.
    .filter((code) => CODE_ONLY_NAME.test(code) && /^[a-z]{2}/.test(compact.slice(code.length)) && compact.startsWith(code))
    .sort((a, b) => b.length - a.length || byString(a, b))
  return codes.length > 0 ? `begins with building code ${codes[0].toUpperCase()}; probably a room code` : undefined
}

function nearestBuilding(point: Point, drafts: readonly Draft[]): UnlinkedPrefix['nearest'] {
  let best: { buildingId: string, metres: number } | undefined
  for (const draft of [...drafts].sort((a, b) => byString(a.id, b.id))) {
    const metres = distanceMetres(point, draft.location)
    if (!best || metres < best.metres) best = { buildingId: draft.id, metres }
  }
  return best && { buildingId: best.buildingId, metres: Math.round(best.metres) }
}

function findStandaloneCandidates(venues: VenueLocationMap, drafts: readonly Draft[]): StandaloneCandidate[] {
  const buildingCodes = new Set(drafts.flatMap((draft) => draft.codes))
  const prefixCounts = new Map<string, number>()
  for (const code of Object.keys(venues)) {
    const prefix = roomBuildingToken(code)
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1)
  }
  return Object.keys(venues).sort(byString).flatMap((venueCode): StandaloneCandidate[] => {
    if (buildingCodes.has(compactName(venueCode))) return [{ venueCode, reason: 'matches a building code' }]
    const prefix = roomBuildingToken(venueCode)
    if (prefix === venueCode && prefixCounts.get(prefix) === 1) return [{ venueCode, reason: 'no room structure' }]
    return []
  })
}

function findRepeatedNames(buildings: readonly Building[]): RepeatedName[] {
  const groups = new Map<string, Building[]>()
  for (const building of buildings) {
    if (building.groupKey === undefined) continue
    groups.set(building.groupKey, [...(groups.get(building.groupKey) ?? []), building])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byString(a, b))
    .map(([groupKey, members]) => ({
      name: members[0].name,
      groupKey,
      buildingIds: members.map((member) => member.id),
      addresses: uniqueSorted(members.map((member) => member.address ?? '')),
    }))
}

function findSharedCoordinates(drafts: readonly Draft[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const draft of drafts) {
    const key = `${draft.api.latitude},${draft.api.longitude}`
    groups.set(key, [...(groups.get(key) ?? []), draft.id])
  }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => [...ids].sort(byString))
    .sort((a, b) => byString(a[0], b[0]))
}

function findStaleAliases(
  aliases: readonly BuildingAlias[],
  drafts: readonly Draft[],
  prefixRooms: readonly PrefixRooms[],
  mergedNames: readonly string[],
): string[] {
  const names = new Set([...drafts.map((draft) => draft.normalisedName), ...mergedNames.map((name) => normaliseName(name))])
  const prefixes = new Set(prefixRooms.map((rooms) => compactName(rooms.prefix)))
  return [...aliases].sort((a, b) => byString(a.prefix, b.prefix)).flatMap((alias) => [
    ...(prefixes.has(compactName(alias.prefix)) ? [] : [`${alias.prefix}: no room code uses this prefix`]),
    ...(names.has(normaliseName(alias.name)) ? [] : [`${alias.prefix}: "${alias.name}" is not an API building name`]),
  ])
}

function findDataIssues(apiBuildings: readonly ApiBuilding[]): string[] {
  const issues: string[] = []
  for (const api of [...apiBuildings].sort((a, b) => byString(a.elementId, b.elementId))) {
    const label = `${api.name} (${api.elementId})`
    if (!/^\d{6}$/.test(api.postal)) {
      issues.push(`${label}: postal ${JSON.stringify(api.postal)} is not a 6-digit code, so it was omitted`)
    }
    if (api.address.trim().length === 0) issues.push(`${label}: address is blank, so it was omitted`)
  }
  return issues
}

/**
 * Turns validated API records and our venues into a building catalogue. Each room-code prefix
 * is linked by the first confident rule (override, exact code, alias, unique name); anything
 * ambiguous or unmatched is left unlinked and reported. Proximity never links.
 */
export function buildCatalogue(input: BuildCatalogueInput): BuildCatalogueResult {
  const ids = assignIds(input.apiBuildings)
  const merges = mergeAways(input)
  const drafts = createDrafts(input, merges, ids)
  const aliases = new Map(input.aliases.map((alias) => [compactName(alias.prefix), alias]))

  const links: PrefixLink[] = []
  const ambiguous: AmbiguousMatch[] = []
  const unlinkedPrefixes: UnlinkedPrefix[] = []
  const distanceWarnings: DistanceWarning[] = []
  let roomsLinked = 0

  const unlinkedReasons = new Map(
    Object.entries(input.intentionallyUnlinked ?? {}).map(([prefix, reason]) => [compactName(prefix), reason]),
  )

  const prefixRooms = groupRoomsByPrefix(input.venues)
  for (const rooms of prefixRooms) {
    const reason = unlinkedReasons.get(compactName(rooms.prefix))
    if (reason !== undefined) {
      unlinkedPrefixes.push({
        prefix: rooms.prefix,
        roomCount: rooms.codes.length,
        note: `Left unlinked on purpose: ${reason}`,
      })
      continue
    }
    const result = linkPrefix(rooms, drafts, aliases, input.venues)
    if (result.kind === 'linked') {
      const { draft, rule } = result
      draft.prefixes.add(rooms.prefix)
      if (rule === 'alias') {
        draft.linkedAliases.add(aliases.get(compactName(rooms.prefix))?.prefix ?? rooms.prefix)
      }
      links.push({ prefix: rooms.prefix, buildingId: draft.id, rule, roomCount: rooms.codes.length })
      roomsLinked += rooms.codes.length
      if (rule !== 'override' && rooms.median) {
        const metres = distanceMetres(rooms.median, draft.location)
        if (metres > DISTANCE_WARNING_METRES) {
          distanceWarnings.push({ prefix: rooms.prefix, buildingId: draft.id, metres: Math.round(metres) })
        }
      }
      continue
    }
    if (result.kind === 'ambiguous') {
      ambiguous.push({ prefix: rooms.prefix, rule: result.rule, buildingIds: result.drafts.map((d) => d.id).sort(byString) })
    }
    const note = prefixNote(rooms.prefix, drafts)
    const nearest = rooms.median && nearestBuilding(rooms.median, drafts)
    unlinkedPrefixes.push({
      prefix: rooms.prefix,
      roomCount: rooms.codes.length,
      ...(note === undefined ? {} : { note }),
      ...(nearest === undefined ? {} : { nearest }),
    })
  }

  const buildings = drafts.map(toBuilding).sort((a, b) => byString(a.id, b.id))
  const roomCount = Object.keys(input.venues).length
  return {
    catalogue: { version: 1, source: input.source, buildings },
    findings: {
      counts: {
        apiRecords: input.apiBuildings.length,
        buildingsWritten: buildings.length,
        roomsLinked,
        roomsUnlinked: roomCount - roomsLinked,
      },
      links,
      ambiguous,
      unlinkedPrefixes,
      distanceWarnings,
      repeatedNames: findRepeatedNames(buildings),
      standaloneCandidates: findStandaloneCandidates(input.venues, drafts),
      buildingsWithoutRooms: buildings.filter((b) => b.roomCodePrefixes.length === 0).map((b) => b.id),
      sharedCoordinates: findSharedCoordinates(drafts),
      staleAliases: findStaleAliases(input.aliases, drafts, prefixRooms, merges.map((merge) => merge.api.name)),
      merged: merges.map((merge) => ({
        name: merge.api.name,
        elementId: merge.api.elementId,
        buildingId: ids.get(merge.targetElementId) as string,
      })),
      dataIssues: findDataIssues(input.apiBuildings),
    },
  }
}

/**
 * Hand-edited building decisions in scripts/data/building-overrides.json, merged at import time
 * (never shipped to the browser). An override wins over the API and over our data; the import
 * only reads the file, so a re-run never overwrites it. Shape:
 *
 *   { "version": 1, "$comment"?: string, "overrides": { "<elementId>": BuildingOverride } }
 *
 * roomCodePrefixes replaces the computed links for that building; location replaces the API
 * centroid (and drops the centroid marker); entrance (x, y, osmNode) replaces it with a provisional
 * OpenStreetMap entrance and cannot be combined with location; aliases replaces the derived search aliases.
 */
export type BuildingOverride = {
  readonly name?: string
  readonly aliases?: readonly string[]
  readonly roomCodePrefixes?: readonly string[]
  readonly location?: { readonly x: number, readonly y: number }
  /** Accepted but unverified OpenStreetMap entrance; replaces the centroid and records the node. */
  readonly entrance?: { readonly x: number, readonly y: number, readonly osmNode: string }
  readonly groupKey?: string
  /** Label for this part of a group, for example "Blocks 15-17". */
  readonly partLabel?: string
  /** Block numbers this part covers, for example ["15", "16", "17"]. */
  readonly blocks?: readonly string[]
  /** 'entrance' marks the group's main entrance record, which is not a building chip. */
  readonly groupRole?: 'entrance'
}

/** Hand-edited decisions keyed by API elementId. */
export type BuildingOverrides = Readonly<Record<string, BuildingOverride>>

const FILE_FIELDS = new Set(['version', '$comment', 'overrides', 'unlinkedPrefixes'])
const OVERRIDE_FIELDS = new Set([
  'name', 'aliases', 'roomCodePrefixes', 'location', 'entrance', 'groupKey', 'partLabel', 'blocks', 'groupRole', '$comment',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isLocation(value: unknown): value is { x: number, y: number } {
  return isRecord(value) &&
    typeof value.x === 'number' && Number.isFinite(value.x) && Math.abs(value.x) <= 180 &&
    typeof value.y === 'number' && Number.isFinite(value.y) && Math.abs(value.y) <= 90
}

function isEntrance(value: unknown): value is { x: number, y: number, osmNode: string } {
  if (!isLocation(value)) return false
  const { osmNode } = value as { osmNode?: unknown }
  return typeof osmNode === 'string' && /^\d+$/.test(osmNode)
}

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value) && new Set(value).size === value.length
}

function parseOverride(elementId: string, value: unknown, issues: string[]): BuildingOverride | undefined {
  if (!isRecord(value)) {
    issues.push(`Override ${elementId} must be an object`)
    return undefined
  }
  for (const field of Object.keys(value)) {
    if (!OVERRIDE_FIELDS.has(field)) issues.push(`Override ${elementId} has unknown field ${field}`)
  }
  const { name, aliases, roomCodePrefixes, location, entrance, groupKey, partLabel, blocks, groupRole } = value
  if (name !== undefined && !isNonEmptyString(name)) issues.push(`Override ${elementId} name must be a non-empty string`)
  if (aliases !== undefined && !isStringArray(aliases)) {
    issues.push(`Override ${elementId} aliases must be an array of non-empty strings`)
  }
  if (roomCodePrefixes !== undefined && !isStringArray(roomCodePrefixes)) {
    issues.push(`Override ${elementId} roomCodePrefixes must be an array of non-empty strings`)
  }
  if (location !== undefined && !isLocation(location)) {
    issues.push(`Override ${elementId} location must be { x: longitude, y: latitude } within range`)
  }
  if (entrance !== undefined && !isEntrance(entrance)) {
    issues.push(`Override ${elementId} entrance must be { x: longitude, y: latitude, osmNode: numeric OSM node id }`)
  }
  if (entrance !== undefined && location !== undefined) {
    issues.push(`Override ${elementId} cannot set both entrance and location`)
  }
  if (groupKey !== undefined && !isNonEmptyString(groupKey)) {
    issues.push(`Override ${elementId} groupKey must be a non-empty string`)
  }
  if (partLabel !== undefined && !isNonEmptyString(partLabel)) {
    issues.push(`Override ${elementId} partLabel must be a non-empty string`)
  }
  if (blocks !== undefined && !isUniqueStringArray(blocks)) {
    issues.push(`Override ${elementId} blocks must be an array of non-empty strings with no duplicates`)
  }
  if (groupRole !== undefined && groupRole !== 'entrance') {
    issues.push(`Override ${elementId} groupRole must be "entrance"`)
  }
  return {
    ...(name === undefined ? {} : { name: name as string }),
    ...(aliases === undefined ? {} : { aliases: [...aliases as string[]] }),
    ...(roomCodePrefixes === undefined ? {} : { roomCodePrefixes: [...roomCodePrefixes as string[]] }),
    ...(location === undefined ? {} : { location: { ...location as { x: number, y: number } } }),
    ...(entrance === undefined ? {} : { entrance: { ...entrance as { x: number, y: number, osmNode: string } } }),
    ...(groupKey === undefined ? {} : { groupKey: groupKey as string }),
    ...(partLabel === undefined ? {} : { partLabel: partLabel as string }),
    ...(blocks === undefined ? {} : { blocks: [...blocks as string[]] }),
    ...(groupRole === undefined ? {} : { groupRole: 'entrance' as const }),
  }
}

/**
 * Room-code prefixes the maintainer decided not to link to any building, each with a reason
 * (for example a code that spans several buildings). Keyed by prefix.
 */
export function parseUnlinkedPrefixes(input: unknown): Readonly<Record<string, string>> {
  if (!isRecord(input)) throw new Error('Building overrides file must be an object')
  if (input.unlinkedPrefixes === undefined) return {}
  if (!isRecord(input.unlinkedPrefixes)) throw new Error('Building overrides unlinkedPrefixes must be an object')
  const issues: string[] = []
  const prefixes: Record<string, string> = {}
  for (const [prefix, reason] of Object.entries(input.unlinkedPrefixes)) {
    if (isNonEmptyString(reason)) prefixes[prefix] = reason
    else issues.push(`unlinkedPrefixes ${prefix} must have a non-empty reason`)
  }
  if (issues.length > 0) throw new Error(`Building overrides are invalid: ${issues.join('; ')}`)
  return prefixes
}

/** Validates the overrides file at its boundary; unknown elementIds or fields fail the import. */
export function parseOverrides(input: unknown, knownElementIds: ReadonlySet<string>): BuildingOverrides {
  if (!isRecord(input)) throw new Error('Building overrides file must be an object')
  const issues: string[] = []
  for (const field of Object.keys(input)) {
    if (!FILE_FIELDS.has(field)) issues.push(`Building overrides file has unknown field ${field}`)
  }
  if (input.version !== 1) issues.push(`Building overrides version must be 1: ${String(input.version)}`)
  if (input.$comment !== undefined && typeof input.$comment !== 'string') {
    issues.push('Building overrides $comment must be a string')
  }

  const overrides: Record<string, BuildingOverride> = {}
  if (!isRecord(input.overrides)) {
    issues.push('Building overrides "overrides" must be an object keyed by elementId')
  } else {
    for (const [elementId, value] of Object.entries(input.overrides)) {
      if (!knownElementIds.has(elementId)) issues.push(`Override ${elementId} is not an elementId in the snapshot`)
      const override = parseOverride(elementId, value, issues)
      if (override) overrides[elementId] = override
    }
  }

  if (issues.length > 0) throw new Error(`Building overrides are invalid: ${issues.join('; ')}`)
  return overrides
}

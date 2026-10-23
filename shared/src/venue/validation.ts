import type { BuildingCatalogue } from './buildings.ts'
import type { VenueLocation, VenueLocationMap } from './types.ts'

export class VenueValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'VenueValidationError'
    this.issues = Object.freeze([...issues])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidFloor(value: unknown): boolean {
  return (
    value === undefined || value === null ||
    (typeof value === 'number' && Number.isInteger(value))
  )
}

function validateVenue(
  code: string,
  value: unknown,
  issues: string[],
): value is VenueLocation {
  if (!isRecord(value)) {
    issues.push(`Venue ${code} must be an object`)
    return false
  }

  if (typeof value.roomName !== 'string' || value.roomName.trim().length === 0) {
    issues.push(`Venue ${code} roomName must be a non-empty string`)
  }
  if (!isValidFloor(value.floor)) {
    issues.push(`Venue ${code} floor must be an integer or null when provided`)
  }

  if (value.location === undefined) return true
  if (!isRecord(value.location)) {
    issues.push(`Venue ${code} location must be an object when provided`)
    return false
  }

  const longitude = value.location.x
  const latitude = value.location.y
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    issues.push(`Venue ${code} has invalid longitude: ${String(longitude)}`)
  }
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    issues.push(`Venue ${code} has invalid latitude: ${String(latitude)}`)
  }

  return true
}

export function validateVenueLocationMap(input: unknown): VenueLocationMap {
  const issues: string[] = []
  if (!isRecord(input)) {
    throw new VenueValidationError(['Venue data must be an object'])
  }

  for (const [code, value] of Object.entries(input)) {
    if (code.trim().length === 0) {
      issues.push('Venue code must be a non-empty string')
      continue
    }
    validateVenue(code, value, issues)
  }

  if (issues.length > 0) throw new VenueValidationError(issues)
  const validatedVenues = Object.fromEntries(Object.entries(input).map(([code, value]) => {
    const venue = value as VenueLocation
    return [code, Object.freeze({
      ...venue,
      location: venue.location ? Object.freeze({ ...venue.location }) : undefined,
    })]
  }))
  return Object.freeze(validatedVenues) as VenueLocationMap
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value) && new Set(value).size === value.length
}

function validateBuildingLocation(label: string, value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${label} location must be an object`)
    return
  }
  const longitude = value.x
  const latitude = value.y
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    issues.push(`${label} has invalid longitude: ${String(longitude)}`)
  }
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    issues.push(`${label} has invalid latitude: ${String(latitude)}`)
  }
}

function validateBlockLocations(label: string, value: unknown, blocks: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${label} blockLocations must be an object when provided`)
    return
  }
  if (!isStringArray(blocks)) {
    issues.push(`${label} blockLocations requires blocks`)
    return
  }
  for (const [block, location] of Object.entries(value)) {
    if (!blocks.includes(block)) {
      issues.push(`${label} blockLocations["${block}"] must match a block listed in blocks`)
    }
    validateBuildingLocation(`${label} blockLocations["${block}"]`, location, issues)
  }
}

function validateBuilding(index: number, value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`Building #${index + 1} must be an object`)
    return
  }
  const label = isNonEmptyString(value.id) ? `Building ${value.id}` : `Building #${index + 1}`

  if (!isNonEmptyString(value.id)) issues.push(`${label} id must be a non-empty string`)
  if (!isNonEmptyString(value.name)) issues.push(`${label} name must be a non-empty string`)
  if (!isNonEmptyString(value.elementId)) issues.push(`${label} elementId must be a non-empty string`)
  if (!isStringArray(value.aliases)) issues.push(`${label} aliases must be an array of non-empty strings`)
  if (value.groupKey !== undefined && !isNonEmptyString(value.groupKey)) {
    issues.push(`${label} groupKey must be a non-empty string when provided`)
  }
  if (value.partLabel !== undefined && !isNonEmptyString(value.partLabel)) {
    issues.push(`${label} partLabel must be a non-empty string when provided`)
  }
  if (value.blocks !== undefined && !isUniqueStringArray(value.blocks)) {
    issues.push(`${label} blocks must be an array of non-empty strings with no duplicates when provided`)
  }
  if (value.blockLocations !== undefined) {
    validateBlockLocations(label, value.blockLocations, value.blocks, issues)
  }
  if (value.groupRole !== undefined && value.groupRole !== 'entrance') {
    issues.push(`${label} groupRole must be "entrance" when provided`)
  }
  if (value.groupKey === undefined) {
    if (value.partLabel !== undefined) issues.push(`${label} partLabel requires a groupKey`)
    if (value.blocks !== undefined) issues.push(`${label} blocks requires a groupKey`)
    if (value.groupRole !== undefined) issues.push(`${label} groupRole requires a groupKey`)
  }
  if (value.address !== undefined && !isNonEmptyString(value.address)) {
    issues.push(`${label} address must be a non-empty string when provided`)
  }
  if (value.postal !== undefined && !(typeof value.postal === 'string' && /^\d{6}$/.test(value.postal))) {
    issues.push(`${label} postal must be a 6-digit string when provided`)
  }
  validateBuildingLocation(label, value.location, issues)
  if (
    value.locationKind !== undefined &&
    value.locationKind !== 'centroid' &&
    value.locationKind !== 'provisional-entrance'
  ) {
    issues.push(`${label} locationKind must be "centroid" or "provisional-entrance" when provided`)
  }
  if (!isStringArray(value.roomCodePrefixes)) {
    issues.push(`${label} roomCodePrefixes must be an array of non-empty strings`)
  }
  const refsValid = Array.isArray(value.sourceRefs) && value.sourceRefs.every(
    (ref) => isRecord(ref) && isNonEmptyString(ref.source) && isNonEmptyString(ref.elementId),
  )
  if (!refsValid) issues.push(`${label} sourceRefs must be an array of { source, elementId }`)
}

function compactPrefix(prefix: string): string {
  return prefix.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function validateBuildingUniqueness(buildings: readonly unknown[], issues: string[]): void {
  const idCounts = new Map<string, number>()
  const elementIdCounts = new Map<string, number>()
  const prefixOwners = new Map<string, { display: string, ids: string[], groupKeys: (string | undefined)[] }>()

  for (const value of buildings) {
    if (!isRecord(value)) continue
    if (isNonEmptyString(value.id)) idCounts.set(value.id, (idCounts.get(value.id) ?? 0) + 1)
    if (isNonEmptyString(value.elementId)) {
      elementIdCounts.set(value.elementId, (elementIdCounts.get(value.elementId) ?? 0) + 1)
    }
    if (!isStringArray(value.roomCodePrefixes)) continue
    const id = isNonEmptyString(value.id) ? value.id : '?'
    for (const prefix of new Set(value.roomCodePrefixes.map(compactPrefix))) {
      const owner = prefixOwners.get(prefix) ?? { display: prefix.toUpperCase(), ids: [], groupKeys: [] }
      owner.ids.push(id)
      owner.groupKeys.push(isNonEmptyString(value.groupKey) ? value.groupKey : undefined)
      prefixOwners.set(prefix, owner)
    }
  }

  for (const [id, count] of idCounts) {
    if (count > 1) issues.push(`Building id ${id} is used by more than one building`)
  }
  for (const [elementId, count] of elementIdCounts) {
    if (count > 1) issues.push(`Building elementId ${elementId} is used by more than one building`)
  }
  for (const { display, ids, groupKeys } of prefixOwners.values()) {
    // Parts of one group (for example the Saga College records) may share a prefix.
    const oneGroup = groupKeys[0] !== undefined && groupKeys.every((key) => key === groupKeys[0])
    if (ids.length > 1 && !oneGroup) {
      issues.push(`Room code prefix ${display} is claimed by more than one building (${ids.join(', ')})`)
    }
  }
}

/** Checks rules that span the parts of one group: one entrance record, and all-or-none part labels. */
function validateGroupParts(buildings: readonly unknown[], issues: string[]): void {
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const value of buildings) {
    if (!isRecord(value) || !isNonEmptyString(value.groupKey)) continue
    groups.set(value.groupKey, [...(groups.get(value.groupKey) ?? []), value])
  }
  const idOf = (building: Record<string, unknown>) => (isNonEmptyString(building.id) ? building.id : '?')

  for (const [groupKey, members] of groups) {
    const entrances = members.filter((member) => member.groupRole === 'entrance')
    if (entrances.length > 1) {
      issues.push(`Group ${groupKey} has more than one entrance record (${entrances.map(idOf).join(', ')})`)
    }
    const parts = members.filter((member) => member.groupRole !== 'entrance')
    const unlabelled = parts.filter((member) => member.partLabel === undefined)
    if (unlabelled.length > 0 && unlabelled.length < parts.length) {
      issues.push(
        `Group ${groupKey} must give partLabel to every non-entrance part or to none (missing: ${unlabelled.map(idOf).join(', ')})`,
      )
    }
  }
}

export function validateBuildingCatalogue(input: unknown): BuildingCatalogue {
  if (!isRecord(input)) {
    throw new VenueValidationError(['Building catalogue must be an object'])
  }
  const issues: string[] = []

  if (input.version !== 1) issues.push(`Building catalogue version must be 1: ${String(input.version)}`)
  const source = input.source
  if (!isRecord(source)) {
    issues.push('Building catalogue source must be an object')
  } else {
    if (!isNonEmptyString(source.name)) issues.push('Building catalogue source name must be a non-empty string')
    if (!isNonEmptyString(source.url)) issues.push('Building catalogue source url must be a non-empty string')
    if (!(typeof source.fetchedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.fetchedOn))) {
      issues.push('Building catalogue source fetchedOn must be a YYYY-MM-DD date')
    }
    if (!isNonEmptyString(source.licenceNote)) {
      issues.push('Building catalogue source licenceNote must be a non-empty string')
    }
  }
  if (!Array.isArray(input.buildings)) {
    issues.push('Building catalogue buildings must be an array')
  } else {
    input.buildings.forEach((building, index) => validateBuilding(index, building, issues))
    validateBuildingUniqueness(input.buildings, issues)
    validateGroupParts(input.buildings, issues)
  }

  if (issues.length > 0) throw new VenueValidationError(issues)
  const catalogue = input as unknown as BuildingCatalogue
  return Object.freeze({
    version: catalogue.version,
    source: Object.freeze({ ...catalogue.source }),
    buildings: Object.freeze(catalogue.buildings.map((building) => Object.freeze({
      ...building,
      aliases: Object.freeze([...building.aliases]),
      location: Object.freeze({ ...building.location }),
      roomCodePrefixes: Object.freeze([...building.roomCodePrefixes]),
      sourceRefs: Object.freeze(building.sourceRefs.map((ref) => Object.freeze({ ...ref }))),
    }))),
  })
}

export function getVenueCount(venues: VenueLocationMap): number {
  return Object.values(venues).filter((venue) => venue.location).length
}

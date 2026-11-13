import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  getCommunityWaypointCategoryLabel,
  getCommunityWaypointFloorLabel,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
  type CommunityWaypointId,
} from './community.ts'
import { SINGAPORE_COORDINATE_BOUNDS } from './coordinate-bounds.ts'
import type { WaypointCoordinate } from './waypoint.ts'

const COMMUNITY_WAYPOINT_ID_PATTERN = /^cw-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COLLECTION_MEMBERS = new Set(['type', 'features', 'bbox'])
const FEATURE_MEMBERS = new Set(['type', 'geometry', 'properties', 'id', 'bbox'])
const GEOMETRY_MEMBERS = new Set(['type', 'coordinates', 'bbox'])
const PROPERTY_MEMBERS = new Set([
  'id',
  'category',
  'source',
  'updatedAt',
  'building',
  'floor',
  'details',
])

export class CommunityWaypointGeoJsonValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommunityWaypointGeoJsonValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(location: string, reason: string): never {
  throw new CommunityWaypointGeoJsonValidationError(`${location}: ${reason}`)
}

function checkMembers(value: Record<string, unknown>, allowed: ReadonlySet<string>, location: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key))
  if (unexpected) invalid(`${location}.${unexpected}`, 'is not allowed in the public dataset')
}

function readString(
  properties: Record<string, unknown>,
  field: string,
  location: string,
  maximumLength?: number,
): string {
  const value = properties[field]
  if (typeof value !== 'string') invalid(`${location}.${field}`, 'must be text')
  const trimmed = value.trim()
  if (!trimmed) invalid(`${location}.${field}`, 'must not be empty')
  if (maximumLength !== undefined && [...trimmed].length > maximumLength) {
    invalid(`${location}.${field}`, `must be at most ${maximumLength} characters`)
  }
  return trimmed
}

function readOptionalString(
  properties: Record<string, unknown>,
  field: 'building' | 'details',
  location: string,
): string | undefined {
  const value = properties[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') invalid(`${location}.${field}`, 'must be text, null, or missing')
  const trimmed = value.trim()
  if (!trimmed) invalid(`${location}.${field}`, 'must be non-empty text when provided')
  if ([...trimmed].length > COMMUNITY_WAYPOINT_TEXT_LIMITS[field]) {
    invalid(`${location}.${field}`, `must be at most ${COMMUNITY_WAYPOINT_TEXT_LIMITS[field]} characters`)
  }
  return trimmed
}

function isCommunityWaypointCategory(value: string): value is CommunityWaypointCategory {
  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.some((category) => category.value === value)
}

function createDisplayLabel(
  category: CommunityWaypointCategory,
  building: string | undefined,
  floor: number | undefined,
): string {
  return [
    getCommunityWaypointCategoryLabel(category),
    building,
    floor === undefined ? undefined : getCommunityWaypointFloorLabel(floor),
  ].filter((part): part is string => part !== undefined).join(' · ')
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysPerMonth[month - 1]
}

function parseFeature(input: unknown, index: number): CommunityWaypoint {
  const location = `features[${index}]`
  if (!isRecord(input) || input.type !== 'Feature') invalid(location, 'must be a GeoJSON Feature')
  checkMembers(input, FEATURE_MEMBERS, location)

  const geometry = input.geometry
  if (!isRecord(geometry) || geometry.type !== 'Point') {
    invalid(`${location}.geometry`, 'must be a Point')
  }
  checkMembers(geometry, GEOMETRY_MEMBERS, `${location}.geometry`)
  const coordinates = geometry.coordinates
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    typeof coordinates[0] !== 'number' ||
    !Number.isFinite(coordinates[0]) ||
    typeof coordinates[1] !== 'number' ||
    !Number.isFinite(coordinates[1])
  ) {
    invalid(`${location}.geometry.coordinates`, 'must be [longitude, latitude] with two finite numbers')
  }
  const coordinate: WaypointCoordinate = { longitude: coordinates[0], latitude: coordinates[1] }

  const properties = input.properties
  if (!isRecord(properties)) invalid(`${location}.properties`, 'must be an object')
  checkMembers(properties, PROPERTY_MEMBERS, `${location}.properties`)

  const id = readString(properties, 'id', `${location}.properties`)
  if (!COMMUNITY_WAYPOINT_ID_PATTERN.test(id)) {
    invalid(`${location}.properties.id`, 'must be a stable cw- UUID')
  }
  const category = readString(properties, 'category', `${location}.properties`)
  if (!isCommunityWaypointCategory(category)) {
    invalid(`${location}.properties.category`, 'must be a supported Community Waypoint category')
  }

  const source = readString(
    properties,
    'source',
    `${location}.properties`,
    COMMUNITY_WAYPOINT_TEXT_LIMITS.source,
  )
  const updatedAt = readString(properties, 'updatedAt', `${location}.properties`)
  if (!isValidDateOnly(updatedAt)) {
    invalid(`${location}.properties.updatedAt`, 'must be a valid YYYY-MM-DD date')
  }
  const building = readOptionalString(properties, 'building', `${location}.properties`)
  const details = readOptionalString(properties, 'details', `${location}.properties`)
  const floorValue = properties.floor
  if (
    floorValue !== undefined &&
    floorValue !== null &&
    (typeof floorValue !== 'number' || !Number.isSafeInteger(floorValue))
  ) {
    invalid(`${location}.properties.floor`, 'must be a signed integer, null, or missing')
  }
  const floor = typeof floorValue === 'number' ? floorValue : undefined
  const displayLabel = createDisplayLabel(category, building, floor)

  const { south, north, west, east } = SINGAPORE_COORDINATE_BOUNDS
  if (
    coordinate.longitude < west || coordinate.longitude > east ||
    coordinate.latitude < south || coordinate.latitude > north
  ) {
    invalid(`${location}.geometry.coordinates`, 'must be within the supported Singapore bounds')
  }

  return {
    id: id.toLowerCase() as CommunityWaypointId,
    displayLabel,
    category,
    coordinate,
    source,
    updatedAt,
    ...(building === undefined ? {} : { building }),
    ...(floor === undefined ? {} : { floor }),
    ...(details === undefined ? {} : { details }),
  }
}

/** Parses an entire public GeoJSON collection or rejects it with a typed error. */
export function parseCommunityWaypointsGeoJson(input: unknown): readonly CommunityWaypoint[] {
  if (!isRecord(input) || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    invalid('root', 'must be a GeoJSON FeatureCollection with a features array')
  }
  checkMembers(input, COLLECTION_MEMBERS, 'root')

  const waypoints = input.features.map(parseFeature)
  const seenIds = new Set<string>()
  for (const [index, waypoint] of waypoints.entries()) {
    if (seenIds.has(waypoint.id)) {
      invalid(`features[${index}].properties.id`, 'must be unique within the collection')
    }
    seenIds.add(waypoint.id)
  }
  return waypoints
}

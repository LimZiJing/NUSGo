import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypointId,
} from './community.ts'
import { SINGAPORE_COORDINATE_BOUNDS } from './coordinate-bounds.ts'
import type { CommunityWaypointSubmission, ProposedCommunityWaypointFields } from './community-submission.ts'

const CATEGORY_VALUES = new Set<string>(COMMUNITY_WAYPOINT_CATEGORIES.map(({ value }) => value))
const WAYPOINT_ID_PATTERN = /^cw-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPLANATION_LIMIT = 1_000

export class InvalidCommunityWaypointSubmissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCommunityWaypointSubmissionError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string): never {
  throw new InvalidCommunityWaypointSubmissionError(message)
}

function assertAllowedFields(input: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    invalid('Submission contains unsupported fields')
  }
}

function requiredText(input: Record<string, unknown>, field: string, maximumLength: number): string {
  const value = input[field]
  if (typeof value !== 'string') invalid(field + ' must be text')
  const trimmed = value.trim()
  if (!trimmed) invalid(field + ' must not be empty')
  if ([...trimmed].length > maximumLength) invalid(field + ' is too long')
  return trimmed
}

function optionalText(
  input: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return undefined
  const value = input[field]
  if (typeof value !== 'string') invalid(field + ' must be text when provided')
  const trimmed = value.trim()
  if (!trimmed) invalid(field + ' must not be empty')
  if ([...trimmed].length > maximumLength) invalid(field + ' is too long')
  return trimmed
}

function requiredCategory(input: Record<string, unknown>): ActiveCommunityWaypointCategory {
  const category = requiredText(input, 'category', 40)
  if (!CATEGORY_VALUES.has(category)) invalid('category is not supported')
  return category as ActiveCommunityWaypointCategory
}

function optionalCategory(input: Record<string, unknown>): ActiveCommunityWaypointCategory | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, 'category')) return undefined
  return requiredCategory(input)
}

function readCoordinates(
  input: Record<string, unknown>,
  required: boolean,
): { readonly longitude: number; readonly latitude: number } | undefined {
  const hasLongitude = Object.prototype.hasOwnProperty.call(input, 'longitude')
  const hasLatitude = Object.prototype.hasOwnProperty.call(input, 'latitude')
  if (!required && !hasLongitude && !hasLatitude) return undefined
  if (!hasLongitude || !hasLatitude) invalid('longitude and latitude must be supplied together')

  const longitude = input.longitude
  const latitude = input.latitude
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    invalid('longitude must be a finite number')
  }
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    invalid('latitude must be a finite number')
  }

  const { south, north, west, east } = SINGAPORE_COORDINATE_BOUNDS
  if (longitude < west || longitude > east || latitude < south || latitude > north) {
    invalid('coordinates must be within the supported Singapore bounds')
  }
  return { longitude, latitude }
}

function optionalFloor(input: Record<string, unknown>): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, 'floor')) return undefined
  const floor = input.floor
  if (typeof floor !== 'number' || !Number.isSafeInteger(floor)) {
    invalid('floor must be a signed integer')
  }
  return floor
}

function readProposedFields(input: Record<string, unknown>): ProposedCommunityWaypointFields {
  const category = optionalCategory(input)
  const coordinates = readCoordinates(input, false)
  const building = optionalText(input, 'building', COMMUNITY_WAYPOINT_TEXT_LIMITS.building)
  const floor = optionalFloor(input)
  const accessibilityNote = optionalText(
    input,
    'accessibilityNote',
    COMMUNITY_WAYPOINT_TEXT_LIMITS.accessibilityNote,
  )
  const details = optionalText(input, 'details', COMMUNITY_WAYPOINT_TEXT_LIMITS.details)

  return {
    ...(category === undefined ? {} : { category }),
    ...(coordinates === undefined ? {} : coordinates),
    ...(building === undefined ? {} : { building }),
    ...(floor === undefined ? {} : { floor }),
    ...(accessibilityNote === undefined ? {} : { accessibilityNote }),
    ...(details === undefined ? {} : { details }),
  }
}

function readWaypointId(input: Record<string, unknown>): CommunityWaypointId {
  const waypointId = requiredText(input, 'waypointId', 64)
  if (!WAYPOINT_ID_PATTERN.test(waypointId)) invalid('waypointId must be a Community Waypoint ID')
  return waypointId.toLowerCase() as CommunityWaypointId
}

const NEW_PLACE_FIELDS = new Set([
  'kind', 'category', 'longitude', 'latitude', 'building', 'floor',
  'accessibilityNote', 'details', 'explanation',
])
const CORRECTION_FIELDS = new Set([
  'kind', 'waypointId', 'requestedChange', 'category', 'longitude',
  'latitude', 'building', 'floor', 'accessibilityNote', 'details',
])
const REMOVAL_FIELDS = new Set(['kind', 'waypointId', 'reason'])

export function parseCommunityWaypointSubmission(input: unknown): CommunityWaypointSubmission {
  if (!isRecord(input)) invalid('Submission must be an object')
  const kind = input.kind

  if (kind === 'new-place') {
    assertAllowedFields(input, NEW_PLACE_FIELDS)
    const fields = readProposedFields(input)
    const category = requiredCategory(input)
    const coordinates = readCoordinates(input, true)!
    const explanation = optionalText(input, 'explanation', EXPLANATION_LIMIT)
    return {
      kind,
      category,
      ...coordinates,
      ...(fields.building === undefined ? {} : { building: fields.building }),
      ...(fields.floor === undefined ? {} : { floor: fields.floor }),
      ...(fields.accessibilityNote === undefined ? {} : { accessibilityNote: fields.accessibilityNote }),
      ...(fields.details === undefined ? {} : { details: fields.details }),
      ...(explanation === undefined ? {} : { explanation }),
    }
  }

  if (kind === 'correction') {
    assertAllowedFields(input, CORRECTION_FIELDS)
    const waypointId = readWaypointId(input)
    const requestedChange = requiredText(input, 'requestedChange', EXPLANATION_LIMIT)
    return { kind, waypointId, requestedChange, ...readProposedFields(input) }
  }

  if (kind === 'removal') {
    assertAllowedFields(input, REMOVAL_FIELDS)
    return {
      kind,
      waypointId: readWaypointId(input),
      reason: requiredText(input, 'reason', EXPLANATION_LIMIT),
    }
  }

  invalid('kind must be new-place, correction, or removal')
}

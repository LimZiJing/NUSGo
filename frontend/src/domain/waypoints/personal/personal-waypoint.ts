import { isValidLocationCoordinates } from '../../location/coordinates'
import type { Waypoint, WaypointCoordinate } from '../waypoint'

export const PERSONAL_WAYPOINT_NAME_MAX_LENGTH = 80
export const PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH = 40
export const PERSONAL_WAYPOINT_NOTE_MAX_LENGTH = 500

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PERSONAL_WAYPOINT_FIELDS = new Set([
  'id',
  'name',
  'category',
  'coordinate',
  'note',
  'createdAt',
  'updatedAt',
])

export interface PersonalWaypoint extends Waypoint {
  readonly note?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type PersonalWaypointValidationField =
  | 'waypoint'
  | 'waypoints'
  | 'id'
  | 'name'
  | 'category'
  | 'coordinate'
  | 'note'
  | 'createdAt'
  | 'updatedAt'

export interface PersonalWaypointValidationIssue {
  readonly field: PersonalWaypointValidationField
  readonly index?: number
  readonly message: string
}

export type PersonalWaypointValidationResult =
  | { readonly ok: true; readonly waypoint: PersonalWaypoint }
  | { readonly ok: false; readonly issues: readonly PersonalWaypointValidationIssue[] }

export type PersonalWaypointsValidationResult =
  | { readonly ok: true; readonly waypoints: readonly PersonalWaypoint[] }
  | { readonly ok: false; readonly issues: readonly PersonalWaypointValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUtcIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString().slice(0, 19) === value.slice(0, 19)
}

function addIssue(
  issues: PersonalWaypointValidationIssue[],
  field: PersonalWaypointValidationField,
  message: string,
): void {
  issues.push({ field, message })
}

export function validatePersonalWaypoint(input: unknown): PersonalWaypointValidationResult {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ field: 'waypoint', message: 'Must be an object.' }] }
  }

  const issues: PersonalWaypointValidationIssue[] = []
  if (Object.keys(input).some((field) => !PERSONAL_WAYPOINT_FIELDS.has(field))) {
    addIssue(issues, 'waypoint', 'Contains unsupported fields.')
  }

  const id = typeof input.id === 'string' ? input.id.toLowerCase() : ''
  if (!UUID_PATTERN.test(id)) addIssue(issues, 'id', 'Must be a UUID.')

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) addIssue(issues, 'name', 'Must not be empty.')
  else if (name.length > PERSONAL_WAYPOINT_NAME_MAX_LENGTH) {
    addIssue(issues, 'name', 'Must be at most ' + PERSONAL_WAYPOINT_NAME_MAX_LENGTH + ' characters.')
  }

  const category = typeof input.category === 'string' ? input.category.trim() : ''
  if (!category) addIssue(issues, 'category', 'Must not be empty.')
  else if (category.length > PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH) {
    addIssue(issues, 'category', 'Must be at most ' + PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + ' characters.')
  }

  let coordinate: WaypointCoordinate | null = null
  if (isRecord(input.coordinate)) {
    const longitude = input.coordinate.longitude
    const latitude = input.coordinate.latitude
    if (
      typeof longitude === 'number' &&
      typeof latitude === 'number' &&
      isValidLocationCoordinates(longitude, latitude) &&
      Object.keys(input.coordinate).every((field) => field === 'longitude' || field === 'latitude')
    ) {
      coordinate = { longitude, latitude }
    }
  }
  if (!coordinate) addIssue(issues, 'coordinate', 'Must contain valid WGS84 longitude and latitude.')

  let note: string | undefined
  if (typeof input.note === 'string') {
    const trimmedNote = input.note.trim()
    if (trimmedNote) {
      if (trimmedNote.length > PERSONAL_WAYPOINT_NOTE_MAX_LENGTH) {
        addIssue(issues, 'note', 'Must be at most ' + PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + ' characters.')
      } else {
        note = trimmedNote
      }
    }
  } else if (input.note !== undefined) {
    addIssue(issues, 'note', 'Must be text when provided.')
  }

  const createdAt = input.createdAt
  if (!isUtcIsoDateTime(createdAt)) addIssue(issues, 'createdAt', 'Must be a UTC ISO date-time.')

  const updatedAt = input.updatedAt
  if (!isUtcIsoDateTime(updatedAt)) addIssue(issues, 'updatedAt', 'Must be a UTC ISO date-time.')

  if (issues.length > 0 || !coordinate || !isUtcIsoDateTime(createdAt) || !isUtcIsoDateTime(updatedAt)) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    waypoint: {
      id,
      name,
      category,
      coordinate,
      ...(note ? { note } : {}),
      createdAt,
      updatedAt,
    },
  }
}

export function validatePersonalWaypoints(input: unknown): PersonalWaypointsValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ field: 'waypoints', message: 'Must be an array.' }] }
  }

  const waypoints: PersonalWaypoint[] = []
  const issues: PersonalWaypointValidationIssue[] = []
  const ids = new Set<string>()

  for (const [index, value] of input.entries()) {
    const result = validatePersonalWaypoint(value)
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => ({ ...issue, index })))
      continue
    }

    if (ids.has(result.waypoint.id)) {
      issues.push({ field: 'id', index, message: 'Must be unique within the collection.' })
      continue
    }

    ids.add(result.waypoint.id)
    waypoints.push(result.waypoint)
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, waypoints }
}

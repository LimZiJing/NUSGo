import { isValidLocationCoordinates } from '../../location/coordinates'
import type { Waypoint, WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'

export const PERSONAL_WAYPOINT_NAME_MAX_LENGTH = 80
export const PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH = 40
export const PERSONAL_WAYPOINT_NOTE_MAX_LENGTH = 500
export const PERSONAL_WAYPOINTS_MAX_COUNT = 500
export const PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'purple', label: 'Purple' },
  { value: 'gray', label: 'Gray' },
] as const
export const PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS = [
  { value: 'dot', label: 'General' },
  { value: 'rest', label: 'Rest' },
  { value: 'food', label: 'Food' },
  { value: 'nature', label: 'Nature' },
  { value: 'favorite', label: 'Favorite' },
] as const
export type PersonalWaypointMarkerColor = typeof PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS[number]['value']
export type PersonalWaypointMarkerIcon = typeof PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS[number]['value']
export const DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR: PersonalWaypointMarkerColor = 'blue'
export const DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON: PersonalWaypointMarkerIcon = 'dot'
export const DEFAULT_PERSONAL_WAYPOINT_COORDINATE: WaypointCoordinate = {
  longitude: 103.7844,
  latitude: 1.2933,
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PersonalWaypoint extends Waypoint {
  readonly note?: string
  readonly markerColor: PersonalWaypointMarkerColor
  readonly markerIcon: PersonalWaypointMarkerIcon
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
  | 'markerColor'
  | 'markerIcon'
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
  | {
      readonly ok: false
      readonly waypoints: readonly PersonalWaypoint[]
      readonly issues: readonly PersonalWaypointValidationIssue[]
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPersonalWaypointMarkerColor(value: unknown): value is PersonalWaypointMarkerColor {
  return PERSONAL_WAYPOINT_MARKER_COLOR_OPTIONS.some(({ value: option }) => option === value)
}

function isPersonalWaypointMarkerIcon(value: unknown): value is PersonalWaypointMarkerIcon {
  return PERSONAL_WAYPOINT_MARKER_ICON_OPTIONS.some(({ value: option }) => option === value)
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
      isValidLocationCoordinates(longitude, latitude)
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

  const markerColor = input.markerColor === undefined
    ? DEFAULT_PERSONAL_WAYPOINT_MARKER_COLOR
    : isPersonalWaypointMarkerColor(input.markerColor) ? input.markerColor : null
  if (markerColor === null) addIssue(issues, 'markerColor', 'Must be a supported marker color.')

  const markerIcon = input.markerIcon === undefined
    ? DEFAULT_PERSONAL_WAYPOINT_MARKER_ICON
    : isPersonalWaypointMarkerIcon(input.markerIcon) ? input.markerIcon : null
  if (markerIcon === null) addIssue(issues, 'markerIcon', 'Must be a supported marker icon.')

  const createdAt = input.createdAt
  if (!isUtcIsoDateTime(createdAt)) addIssue(issues, 'createdAt', 'Must be a UTC ISO date-time.')

  const updatedAt = input.updatedAt
  if (!isUtcIsoDateTime(updatedAt)) addIssue(issues, 'updatedAt', 'Must be a UTC ISO date-time.')
  else if (isUtcIsoDateTime(createdAt) && Date.parse(updatedAt) < Date.parse(createdAt)) {
    addIssue(issues, 'updatedAt', 'Must be on or after the creation timestamp.')
  }

  if (
    issues.length > 0 ||
    !coordinate ||
    markerColor === null ||
    markerIcon === null ||
    !isUtcIsoDateTime(createdAt) ||
    !isUtcIsoDateTime(updatedAt)
  ) {
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
      markerColor,
      markerIcon,
      createdAt,
      updatedAt,
    },
  }
}

export function validatePersonalWaypoints(input: unknown): PersonalWaypointsValidationResult {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      waypoints: [],
      issues: [{ field: 'waypoints', message: 'Must be an array.' }],
    }
  }

  const waypoints: PersonalWaypoint[] = []
  const issues: PersonalWaypointValidationIssue[] = []
  const ids = new Set<string>()

  for (const [index, value] of input.slice(0, PERSONAL_WAYPOINTS_MAX_COUNT).entries()) {
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

  if (input.length > PERSONAL_WAYPOINTS_MAX_COUNT) {
    issues.push({
      field: 'waypoints',
      index: PERSONAL_WAYPOINTS_MAX_COUNT,
      message: `Only the first ${PERSONAL_WAYPOINTS_MAX_COUNT} waypoints can be loaded.`,
    })
  }

  return issues.length > 0
    ? { ok: false, waypoints, issues }
    : { ok: true, waypoints }
}

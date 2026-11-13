import {
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  SINGAPORE_COORDINATE_BOUNDS,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypoint,
  type CommunityWaypointSubmission,
  type ProposedCommunityWaypointFields,
} from '@nusgo/shared'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { CommunityWaypointSubmissionError } from '../../../../domain/waypoints/community-waypoint-submission'

export interface SubmissionDraft {
  readonly category: string
  readonly building: string
  readonly floor: string
  readonly otherFloor: string
  readonly explanation: string
  readonly requestedChange: string
}

export type SubmissionField = keyof SubmissionDraft | 'coordinate'
export type SubmissionErrors = Partial<Record<SubmissionField, string>>
export type LocationStatus = 'locating' | 'ready' | 'required'

export const OTHER_FLOOR = 'other'
export const FLOOR_UNSET = 'unset'

export function initialSubmissionDraft(
  waypoint: CommunityWaypoint | null,
  initialCategory: ActiveCommunityWaypointCategory | null = null,
): SubmissionDraft {
  return {
    category: waypoint?.category ?? initialCategory ?? '',
    building: waypoint?.building ?? '',
    floor: waypoint?.floor === undefined ? '' : String(waypoint.floor),
    otherFloor: '',
    explanation: '',
    requestedChange: '',
  }
}

export function validateSubmissionDraft(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
  locationReady: boolean,
): SubmissionErrors {
  const errors: SubmissionErrors = {}
  if (!waypoint && !draft.category) errors.category = 'Choose a category.'
  if (textExceedsLimit(draft.building, COMMUNITY_WAYPOINT_TEXT_LIMITS.building)) {
    errors.building = 'Keep the building within 80 characters.'
  }
  if (textExceedsLimit(draft.explanation, 1_000)) errors.explanation = 'Keep the note within 1,000 characters.'
  if (textExceedsLimit(draft.requestedChange, 1_000)) errors.requestedChange = 'Keep the reason within 1,000 characters.'
  if (waypoint && !draft.requestedChange.trim()) errors.requestedChange = 'Explain what needs correcting.'

  const floorValue = getFloorInputValue(draft)
  if (
    (draft.floor === OTHER_FLOOR && !floorValue.trim()) ||
    (floorValue.trim() && !Number.isSafeInteger(Number(floorValue)))
  ) errors.floor = 'Enter a whole-number floor.'
  if (!locationReady) errors.coordinate = 'Set the waypoint location before sending.'

  const { south, north, west, east } = SINGAPORE_COORDINATE_BOUNDS
  if (
    !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) ||
    coordinate.latitude < south || coordinate.latitude > north ||
    coordinate.longitude < west || coordinate.longitude > east
  ) errors.coordinate = 'Choose a location within Singapore.'

  return errors
}

export function createSubmission(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
): CommunityWaypointSubmission {
  const floorValue = getFloorInputValue(draft)
  const optionalFields: Omit<ProposedCommunityWaypointFields, 'category' | 'longitude' | 'latitude'> = {
    ...(optionalText(draft.building) ? { building: draft.building.trim() } : {}),
    ...(floorValue.trim() ? { floor: Number(floorValue) } : {}),
  }

  if (waypoint) {
    return {
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: draft.requestedChange.trim(),
      ...(draft.category ? { category: draft.category as ActiveCommunityWaypointCategory } : {}),
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
      ...optionalFields,
    }
  }

  return {
    kind: 'new-place',
    category: draft.category as ActiveCommunityWaypointCategory,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    ...optionalFields,
    ...(optionalText(draft.explanation) ? { explanation: draft.explanation.trim() } : {}),
  }
}

export function getSubmissionErrorMessage(error: unknown, isCorrection: boolean): string {
  const report = isCorrection ? 'correction' : 'suggestion'
  if (!(error instanceof CommunityWaypointSubmissionError)) {
    return `Could not send the ${report}. Try again later.`
  }
  if (error.kind === 'invalid') return `The ${report} could not be accepted. Check the fields and try again.`
  if (error.kind === 'rate-limited') return 'Too many reports were sent. Please try again later.'
  if (error.kind === 'network') return `Could not send the ${report}. Check your connection and try again.`
  return 'Submissions are temporarily unavailable. Please try again later.'
}

function getFloorInputValue(draft: SubmissionDraft): string {
  return draft.floor === OTHER_FLOOR ? draft.otherFloor : draft.floor
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined
}

function textExceedsLimit(value: string, limit: number): boolean {
  return [...value.trim()].length > limit
}

import {
  validatePersonalWaypoint,
  type PersonalWaypoint,
  type PersonalWaypointValidationResult,
} from './personal-waypoint'

export type PersonalWaypointDraft = Pick<PersonalWaypoint, 'name' | 'category' | 'coordinate' | 'note'>

export interface PersonalWaypointCreationDependencies {
  readonly createId: () => string
  readonly now: () => string
}

export function createPersonalWaypoint(
  draft: PersonalWaypointDraft,
  dependencies: PersonalWaypointCreationDependencies,
): PersonalWaypointValidationResult {
  // Generate identity once here so later edits can retain it as the record key.
  const id = dependencies.createId()
  const timestamp = dependencies.now()
  return validatePersonalWaypoint({ ...draft, id, createdAt: timestamp, updatedAt: timestamp })
}

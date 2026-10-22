import {
  validatePersonalWaypoint,
  type PersonalWaypoint,
  type PersonalWaypointValidationResult,
} from '../../domain/waypoints/personal/personal-waypoint'

export type PersonalWaypointDraft = Pick<PersonalWaypoint, 'name' | 'category' | 'coordinate' | 'note'>

export interface PersonalWaypointCreationDependencies {
  readonly createId: () => string
  readonly now: () => string
}

const browserDependencies: PersonalWaypointCreationDependencies = {
  createId: () => globalThis.crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export function createPersonalWaypoint(
  draft: PersonalWaypointDraft,
  dependencies: PersonalWaypointCreationDependencies = browserDependencies,
): PersonalWaypointValidationResult {
  // Generate identity once here so later edits can retain it as the record key.
  const id = dependencies.createId()
  const timestamp = dependencies.now()
  return validatePersonalWaypoint({ ...draft, id, createdAt: timestamp, updatedAt: timestamp })
}

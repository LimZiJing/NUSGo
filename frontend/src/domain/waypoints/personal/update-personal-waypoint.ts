import type { PersonalWaypointDraft } from './create-personal-waypoint'
import {
  validatePersonalWaypoint,
  type PersonalWaypoint,
  type PersonalWaypointValidationResult,
} from './personal-waypoint'

export interface PersonalWaypointUpdateDependencies {
  readonly now: () => string
}

export function updatePersonalWaypoint(
  savedWaypoint: PersonalWaypoint,
  draft: PersonalWaypointDraft,
  dependencies: PersonalWaypointUpdateDependencies,
): PersonalWaypointValidationResult {
  return validatePersonalWaypoint({
    ...draft,
    id: savedWaypoint.id,
    createdAt: savedWaypoint.createdAt,
    updatedAt: dependencies.now(),
  })
}

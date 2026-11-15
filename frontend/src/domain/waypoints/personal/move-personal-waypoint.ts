import { updatePersonalWaypoint } from './update-personal-waypoint'
import {
  PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH,
  type PersonalWaypoint,
} from './personal-waypoint'

export interface PersonalWaypointMoveDependencies {
  readonly now: () => string
}

/**
 * Moves one place into a category, creating that category simply by using the name: categories are
 * derived from the places, never stored on their own, so an emptied source category stops existing
 * without any cleanup.
 *
 * The moved place is appended to the end of the collection, which puts it last inside its new
 * category while every other place keeps its saved order. Returns null when there is nothing to do
 * (unknown place, empty or over-long category, already in that category) or when the record fails
 * validation, so the caller can report a problem without writing.
 */
export function movePersonalWaypointToCategory(
  waypoints: readonly PersonalWaypoint[],
  waypointId: string,
  category: string,
  dependencies: PersonalWaypointMoveDependencies,
): readonly PersonalWaypoint[] | null {
  const destination = category.trim()
  if (!destination || destination.length > PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH) return null

  const waypoint = waypoints.find(({ id }) => id === waypointId)
  if (!waypoint || waypoint.category.trim() === destination) return null

  const updated = updatePersonalWaypoint(waypoint, { ...waypoint, category: destination }, dependencies)
  if (!updated.ok) return null

  return [...waypoints.filter(({ id }) => id !== waypointId), updated.waypoint]
}

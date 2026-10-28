import type { PersonalWaypoint } from './personal-waypoint'

export interface PersonalWaypointCategoryOption {
  readonly category: string
  readonly waypointCount: number
}

export function getPersonalWaypointCategoryOptions(
  waypoints: readonly PersonalWaypoint[],
): readonly PersonalWaypointCategoryOption[] {
  const counts = new Map<string, number>()
  for (const waypoint of waypoints) {
    counts.set(waypoint.category, (counts.get(waypoint.category) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([category, waypointCount]) => ({ category, waypointCount }))
    .sort((left, right) => left.category.localeCompare(right.category))
}

export function filterPersonalWaypointsByCategoryVisibility(
  waypoints: readonly PersonalWaypoint[],
  hiddenCategories: readonly string[],
): readonly PersonalWaypoint[] {
  const hidden = new Set(hiddenCategories)
  return waypoints.filter(({ category }) => !hidden.has(category))
}

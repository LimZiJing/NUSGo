import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

export interface PersonalWaypointGroup {
  readonly category: string
  readonly waypoints: readonly PersonalWaypoint[]
}

/**
 * Groups saved places by their category text, alphabetically by category while keeping each
 * category's existing saved order. Categories are derived data, never separate records, so this is
 * the only place a "group" is defined.
 */
export function groupPersonalWaypointsByCategory(
  waypoints: readonly PersonalWaypoint[],
): readonly PersonalWaypointGroup[] {
  const groups = new Map<string, PersonalWaypoint[]>()

  for (const waypoint of waypoints) {
    const category = waypoint.category.trim()
    const existing = groups.get(category)
    if (existing) existing.push(waypoint)
    else groups.set(category, [waypoint])
  }

  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([category, grouped]) => ({ category, waypoints: grouped }))
}

/** One shared label for a place count so a group heading and a category view cannot disagree. */
export function personalWaypointCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'place' : 'places'}`
}

import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

export function filterPersonalWaypoints(
  waypoints: readonly PersonalWaypoint[],
  searchQuery: string,
  category: string | null,
): readonly PersonalWaypoint[] {
  const search = searchQuery.trim().toLowerCase()

  return waypoints.filter((waypoint) => {
    if (category !== null && waypoint.category !== category) return false
    if (!search) return true

    return `${waypoint.name}\n${waypoint.category}`.toLowerCase().includes(search)
  })
}

export function getPersonalWaypointCategories(
  waypoints: readonly PersonalWaypoint[],
): readonly string[] {
  return [...new Set(waypoints.map(({ category }) => category.trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))
}

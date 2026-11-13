import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'

export interface CommunityWaypointCategoryOption {
  readonly value: CommunityWaypointCategory
  readonly label: string
  readonly count: number
}

export function getCommunityWaypointCategoryOptions(
  waypoints: readonly CommunityWaypoint[],
): readonly CommunityWaypointCategoryOption[] {
  const counts = new Map<CommunityWaypointCategory, number>()
  for (const waypoint of waypoints) {
    counts.set(waypoint.category, (counts.get(waypoint.category) ?? 0) + 1)
  }

  return COMMUNITY_WAYPOINT_READABLE_CATEGORIES.map(({ value, label }) => ({
    value,
    label,
    count: counts.get(value) ?? 0,
  }))
}

export function filterCommunityWaypointsByCategory(
  waypoints: readonly CommunityWaypoint[],
  visibleCategories: readonly CommunityWaypointCategory[],
): readonly CommunityWaypoint[] {
  const visible = new Set(visibleCategories)
  return waypoints.filter(({ category }) => visible.has(category))
}

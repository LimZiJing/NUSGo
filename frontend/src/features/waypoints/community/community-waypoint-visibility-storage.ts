import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'

const VISIBLE_CATEGORIES_KEY = 'navus:community-waypoint-visible-categories:v1'

export function readCommunityWaypointVisibleCategories(): readonly CommunityWaypointCategory[] {
  try {
    const stored = localStorage.getItem(VISIBLE_CATEGORIES_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    const selected = new Set(parsed.filter((value): value is string => typeof value === 'string'))
    return COMMUNITY_WAYPOINT_READABLE_CATEGORIES
      .filter(({ value }) => selected.has(value))
      .map(({ value }) => value)
  } catch {
    return []
  }
}

export function writeCommunityWaypointVisibleCategories(
  categories: readonly CommunityWaypointCategory[],
): boolean {
  try {
    localStorage.setItem(VISIBLE_CATEGORIES_KEY, JSON.stringify(categories))
    return true
  } catch {
    return false
  }
}
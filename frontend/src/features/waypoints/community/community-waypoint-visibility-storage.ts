import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'

const VISIBLE_CATEGORIES_KEY = 'navus:community-waypoint-visible-categories:v1'
const READ_ERROR = 'Saved category visibility could not be read. Review the categories and save to replace it.'

export interface CommunityWaypointVisibilityPreferences {
  readonly categories: readonly CommunityWaypointCategory[]
  readonly error: string | null
}

export function readCommunityWaypointVisibleCategories(): CommunityWaypointVisibilityPreferences {
  try {
    const stored = localStorage.getItem(VISIBLE_CATEGORIES_KEY)
    if (!stored) return { categories: [], error: null }
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return { categories: [], error: READ_ERROR }

    const validCategories = new Set<string>(COMMUNITY_WAYPOINT_READABLE_CATEGORIES.map(({ value }) => value))
    if (parsed.some((value) => typeof value !== 'string' || !validCategories.has(value))) {
      return { categories: [], error: READ_ERROR }
    }

    const selected = new Set(parsed)
    return {
      categories: COMMUNITY_WAYPOINT_READABLE_CATEGORIES
        .filter(({ value }) => selected.has(value))
        .map(({ value }) => value),
      error: null,
    }
  } catch {
    return { categories: [], error: READ_ERROR }
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

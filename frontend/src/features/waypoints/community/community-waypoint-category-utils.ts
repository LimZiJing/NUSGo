import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'

export function isActiveCommunityWaypointCategory(
  category: CommunityWaypointCategory,
): category is ActiveCommunityWaypointCategory {
  return COMMUNITY_WAYPOINT_CATEGORIES.some(({ value }) => value === category)
}

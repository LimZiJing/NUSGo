import type { CommunityWaypointVendingItem } from '@nusgo/shared/waypoints/community'
import { type IconProps } from '../../../ui/icons'
import { COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS } from './community-waypoint-vending-item-icons'

export function CommunityWaypointVendingItemIcon({
  item,
  ...iconProps
}: IconProps & { readonly item: CommunityWaypointVendingItem }) {
  const Icon = COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS[item]
  return <Icon {...iconProps} />
}

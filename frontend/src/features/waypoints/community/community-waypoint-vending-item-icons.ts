import type { ComponentType } from 'react'
import type { CommunityWaypointVendingItem } from '@nusgo/shared/waypoints/community'
import {
  CakeSliceIcon,
  CupSodaIcon,
  PackageIcon,
  PopcornIcon,
  UtensilsIcon,
  type IconProps,
} from '../../../ui/icons'

export const COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS: Readonly<
  Record<CommunityWaypointVendingItem, ComponentType<IconProps>>
> = {
  drinks: CupSodaIcon,
  snacks: PopcornIcon,
  meals: UtensilsIcon,
  supplies: PackageIcon,
  desserts: CakeSliceIcon,
}

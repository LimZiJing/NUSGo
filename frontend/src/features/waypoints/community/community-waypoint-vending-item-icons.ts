import type { ComponentType } from 'react'
import type { CommunityWaypointVendingItem } from '@nusgo/shared/waypoints/community'
import {
  CakeSliceIcon,
  CupSodaIcon,
  PopcornIcon,
  ShoppingBagIcon,
  UtensilsIcon,
  type IconProps,
} from '../../../ui/icons'

export const COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS: Readonly<
  Record<CommunityWaypointVendingItem, ComponentType<IconProps>>
> = {
  drinks: CupSodaIcon,
  snacks: PopcornIcon,
  meals: UtensilsIcon,
  /* A shopping bag, not a parcel: the Prep group shows "Pre-packaged" with a parcel
     icon, and the two appear in the same panel, so they must not share a glyph. */
  supplies: ShoppingBagIcon,
  desserts: CakeSliceIcon,
}

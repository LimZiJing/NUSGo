import type { ComponentType } from 'react'
import type { CommunityWaypointVendingPrep } from '@nusgo/shared/waypoints/community'
import { CookingPotIcon, MicrowaveIcon, PackageIcon, type IconProps } from '../../../ui/icons'

/* Decoration only: the option label is always rendered beside the icon, so these
   reinforce a word that is already there rather than carrying the meaning. */
export const COMMUNITY_WAYPOINT_VENDING_PREP_ICONS: Readonly<
  Record<CommunityWaypointVendingPrep, ComponentType<IconProps>>
> = {
  'made-live': CookingPotIcon,
  'pre-packaged': PackageIcon,
  microwaved: MicrowaveIcon,
}

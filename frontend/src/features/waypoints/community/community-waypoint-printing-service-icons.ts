import type { ComponentType } from 'react'
import type { CommunityWaypointPrintingService } from '@nusgo/shared/waypoints/community'
import { CopyIcon, PrinterIcon, type IconProps } from '../../../ui/icons'

/* Decoration only: the option label is always rendered beside the icon. */
export const COMMUNITY_WAYPOINT_PRINTING_SERVICE_ICONS: Readonly<
  Record<CommunityWaypointPrintingService, ComponentType<IconProps>>
> = {
  print: PrinterIcon,
  photocopy: CopyIcon,
}

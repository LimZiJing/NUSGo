import type { IconProps } from '../../../ui/icons'
import {
  BanknoteIcon,
  CupSodaIcon,
  DropletsIcon,
  MapPinIcon,
  ToiletIcon,
} from '../../../ui/icons'
import type { CommunityWaypointCategory } from '@nusgo/shared/waypoints/community'

const CATEGORY_ICONS: Partial<Record<CommunityWaypointCategory, typeof DropletsIcon>> = {
  water_cooler: DropletsIcon,
  atm: BanknoteIcon,
  toilet: ToiletIcon,
  vending_machine: CupSodaIcon,
}

export function CommunityWaypointCategoryIcon({
  category,
  ...iconProps
}: IconProps & { readonly category: CommunityWaypointCategory }) {
  const Icon = CATEGORY_ICONS[category] ?? MapPinIcon
  return <Icon {...iconProps} />
}

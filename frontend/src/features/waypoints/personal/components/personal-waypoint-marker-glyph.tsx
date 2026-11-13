import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { ArmchairIcon, CircleDotIcon, CoffeeIcon, FavoriteIcon, TreePineIcon } from '../../../../ui/icons'

/**
 * One place owns the saved icon mapping, so the list rows, the details header and the marker style
 * preview cannot drift apart as icons are added.
 */
export function PersonalWaypointMarkerGlyph({
  markerIcon,
  size,
  className,
}: {
  readonly markerIcon: PersonalWaypoint['markerIcon']
  readonly size: number
  readonly className?: string
}) {
  if (markerIcon === 'rest') return <ArmchairIcon size={size} className={className} />
  if (markerIcon === 'food') return <CoffeeIcon size={size} className={className} />
  if (markerIcon === 'nature') return <TreePineIcon size={size} className={className} />
  if (markerIcon === 'favorite') return <FavoriteIcon filled={false} size={size} className={className} />
  return <CircleDotIcon size={size} className={className} />
}

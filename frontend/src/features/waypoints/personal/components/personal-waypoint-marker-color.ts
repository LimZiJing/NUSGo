import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

/**
 * The saved colour class. Rows, the details header and the marker style preview all paint with the
 * marker colour token instead of the accent, so a place looks the same wherever it appears.
 *
 * This lives beside the glyph rather than inside it: the component module must export only
 * components to keep fast refresh working.
 */
export function personalWaypointMarkerColorClass(markerColor: PersonalWaypoint['markerColor']): string {
  return `personal-waypoint-pin-${markerColor}`
}

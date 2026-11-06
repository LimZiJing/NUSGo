import type { PersonalWaypoint } from '../../../domain/waypoints/personal/personal-waypoint'

// Every individual delete entry point shares one prompt so it always names the selected waypoint.
export function confirmPersonalWaypointDeletion(waypoint: Pick<PersonalWaypoint, 'name'>): boolean {
  return window.confirm(`Delete "${waypoint.name}"? This cannot be undone.`)
}

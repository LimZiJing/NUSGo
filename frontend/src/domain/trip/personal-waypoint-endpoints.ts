import { isValidLocationCoordinates } from '../location/coordinates'
import type { PersonalWaypoint } from '../waypoints/personal/personal-waypoint'
import type { PersonalWaypointTripEndpoint, TripEndpoint, TripRequest } from './types'

export function createPersonalWaypointTripEndpoint(
  waypoint: PersonalWaypoint,
): PersonalWaypointTripEndpoint | null {
  const { longitude, latitude } = waypoint.coordinate
  if (!waypoint.id.trim() || !waypoint.name.trim() || !isValidLocationCoordinates(longitude, latitude)) return null

  return Object.freeze({
    kind: 'personal-waypoint',
    id: waypoint.id,
    label: waypoint.name,
    coordinate: Object.freeze({ longitude, latitude }),
  })
}

function refreshEndpoint(
  endpoint: TripEndpoint | null,
  waypointsById: ReadonlyMap<string, PersonalWaypoint>,
): TripEndpoint | null {
  if (endpoint?.kind !== 'personal-waypoint') return endpoint
  const waypoint = waypointsById.get(endpoint.id)
  if (!waypoint) return null

  const refreshed = createPersonalWaypointTripEndpoint(waypoint)
  if (!refreshed) return null
  return endpoint.label === refreshed.label &&
    endpoint.coordinate.longitude === refreshed.coordinate.longitude &&
    endpoint.coordinate.latitude === refreshed.coordinate.latitude
    ? endpoint
    : refreshed
}

/** Refreshes selected labels and coordinates by stable ID, and clears deleted records. */
export function reconcilePersonalWaypointEndpoints(
  request: TripRequest,
  waypoints: readonly PersonalWaypoint[],
): TripRequest {
  const waypointsById = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]))
  const origin = refreshEndpoint(request.origin, waypointsById)
  const destination = refreshEndpoint(request.destination, waypointsById)
  return origin === request.origin && destination === request.destination
    ? request
    : { origin, destination }
}

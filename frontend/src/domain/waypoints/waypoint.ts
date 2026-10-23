/** Fields shared by personal and reviewed community waypoints. */
export interface Waypoint {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly coordinate: WaypointCoordinate
}

export interface WaypointCoordinate {
  readonly longitude: number
  readonly latitude: number
}

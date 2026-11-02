import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

export function PersonalWaypointSummary({ waypoint, showName = false }: {
  readonly waypoint: PersonalWaypoint
  readonly showName?: boolean
}) {
  return <dl>
    {showName && <div>
      <dt>Name</dt>
      <dd>{waypoint.name}</dd>
    </div>}
    <div>
      <dt>Category</dt>
      <dd>{waypoint.category}</dd>
    </div>
    <div>
      <dt>Note</dt>
      <dd>{waypoint.note || 'No note added.'}</dd>
    </div>
    <div>
      <dt>Location</dt>
      <dd>{waypoint.coordinate.latitude.toFixed(6)}, {waypoint.coordinate.longitude.toFixed(6)}</dd>
    </div>
  </dl>
}

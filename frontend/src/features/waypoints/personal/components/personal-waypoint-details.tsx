import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../../ui/button'
import { PersonalWaypointSummary } from './personal-waypoint-summary'

export function PersonalWaypointDetails({ waypoint, canManage, onEdit, onDelete }: {
  readonly waypoint: PersonalWaypoint | null
  readonly canManage: boolean
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  if (!waypoint) {
    return <p className="personal-waypoint-details-unavailable" role="status">
      This waypoint is no longer available in the saved list.
    </p>
  }

  return <section className="personal-waypoint-details" aria-labelledby="personal-waypoint-details-heading">
    <h3 id="personal-waypoint-details-heading">{waypoint.name}</h3>
    <PersonalWaypointSummary waypoint={waypoint} />
    {!canManage && <p role="status">
      Editing and deleting are paused until saved waypoint data is recovered.
    </p>}
    <div className="personal-waypoint-details-actions">
      <Button label="Edit waypoint" variant="primary" disabled={!canManage} onClick={onEdit} />
      <Button label="Delete waypoint" variant="secondary" disabled={!canManage} onClick={onDelete} />
    </div>
  </section>
}

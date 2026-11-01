import { FileText } from 'lucide-react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { CompassIcon, MapPinIcon } from '../../../../ui/icons'
import { Button } from '../../../../ui/button'

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
    <header className="personal-waypoint-details-identity">
      <span className="personal-waypoint-details-identity-icon">
        <CompassIcon size={20} />
      </span>
      <div className="personal-waypoint-details-identity-copy">
        <h3 id="personal-waypoint-details-heading">{waypoint.name}</h3>
        <span className="personal-waypoint-details-category">
          <span className="visually-hidden">Category: </span>
          <span>{waypoint.category}</span>
        </span>
      </div>
    </header>

    <div className="personal-waypoint-details-fields">
      {waypoint.note && <section className="personal-waypoint-details-note" aria-label="Note">
        <h4 className="personal-waypoint-details-label personal-waypoint-details-note-title">
          <FileText size={14} aria-hidden="true" focusable="false" />
          <span>Note</span>
        </h4>
        <p>{waypoint.note}</p>
      </section>}
      <div className="personal-waypoint-details-location">
        <MapPinIcon size={18} />
        <dl>
          <dt className="personal-waypoint-details-label">Location</dt>
          <dd>{waypoint.coordinate.latitude.toFixed(6)}, {waypoint.coordinate.longitude.toFixed(6)}</dd>
        </dl>
      </div>
    </div>

    {!canManage && <p className="personal-waypoint-details-status" role="status">
      Editing and deleting are unavailable until saved data is recovered.
    </p>}
    <div className="personal-waypoint-details-actions">
      <Button label="Edit waypoint" variant="primary" size="lg" disabled={!canManage} onClick={onEdit} />
      <Button label="Delete waypoint" variant="secondary" size="lg" disabled={!canManage} onClick={onDelete} />
    </div>
  </section>
}

import { FileText } from 'lucide-react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { EditIcon, MapPinIcon, TrashIcon } from '../../../../ui/icons'
import { NavigateButton } from '../../../../ui/navigate-button'
import { MenuItem } from '../../../../ui/menu-item'
import { OverflowMenu } from '../../../../ui/overflow-menu'
import { PersonalWaypointMarkerGlyph } from './personal-waypoint-marker-glyph'
import { personalWaypointMarkerColorClass } from './personal-waypoint-marker-color'

export function PersonalWaypointDetails({ waypoint, canManage, onDirections, onEdit, onDelete }: {
  readonly waypoint: PersonalWaypoint | null
  readonly canManage: boolean
  readonly onDirections: () => void
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
      <span
        className={`personal-waypoint-details-identity-icon ${personalWaypointMarkerColorClass(waypoint.markerColor)}`}
        data-marker-color={waypoint.markerColor}
        data-marker-icon={waypoint.markerIcon}
        aria-hidden="true"
      >
        <PersonalWaypointMarkerGlyph markerIcon={waypoint.markerIcon} size={20} />
      </span>
      <div className="personal-waypoint-details-identity-copy">
        <h3 id="personal-waypoint-details-heading">{waypoint.name}</h3>
        <span className="personal-waypoint-details-category">
          <span className="visually-hidden">Category: </span>
          <span>{waypoint.category}</span>
        </span>
      </div>
      {/* The one overflow menu this screen is allowed: the record's own actions. */}
      <OverflowMenu label="Waypoint actions" menuLabel="Waypoint actions">
        <MenuItem label="Edit waypoint" icon={<EditIcon />} disabled={!canManage} onClick={onEdit} />
        <MenuItem label="Delete waypoint" icon={<TrashIcon />} disabled={!canManage} onClick={onDelete} />
      </OverflowMenu>
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
          <dd className="personal-waypoint-details-coordinate">
            {waypoint.coordinate.latitude.toFixed(6)}, {waypoint.coordinate.longitude.toFixed(6)}
          </dd>
        </dl>
      </div>
    </div>

    {!canManage && <p className="personal-waypoint-details-status" role="status">
      Editing and deleting are unavailable until saved data is recovered.
    </p>}
    <div className="personal-waypoint-details-actions">
      <NavigateButton className="personal-waypoint-details-navigate" onClick={onDirections} />
    </div>
  </section>
}

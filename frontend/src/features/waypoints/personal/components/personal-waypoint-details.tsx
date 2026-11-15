import { useState } from 'react'
import { FileText } from 'lucide-react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH } from '../../../../domain/waypoints/personal/personal-waypoint'
import { Button, IconButton } from '../../../../ui/button'
import { CloseIcon, EditIcon, MapPinIcon, MoveToCategoryIcon, TrashIcon } from '../../../../ui/icons'
import { NavigateButton } from '../../../../ui/navigate-button'
import { MenuItem } from '../../../../ui/menu-item'
import { OverflowMenu } from '../../../../ui/overflow-menu'
import { ConnectedCategoryPicker } from './connected-category-picker'
import { PersonalWaypointMarkerGlyph } from './personal-waypoint-marker-glyph'
import { personalWaypointMarkerColorClass } from './personal-waypoint-marker-color'

export function PersonalWaypointDetails({
  waypoint,
  canManage,
  categories,
  onDirections,
  onEdit,
  onDelete,
  onMove,
}: {
  readonly waypoint: PersonalWaypoint | null
  readonly canManage: boolean
  /** Every category currently in the collection, for the Move picker. */
  readonly categories: readonly string[]
  readonly onDirections: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
  /** Commits the move; the caller returns to the collection, where the popup offers Undo. */
  readonly onMove: (category: string) => void
}) {
  const [moving, setMoving] = useState(false)

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
      Moving, editing and deleting are unavailable until saved data is recovered.
    </p>}

    <div className="personal-waypoint-details-actions">
      <NavigateButton className="personal-waypoint-details-navigate" onClick={onDirections} />
      {/* Move sits beside Navigate as its own action instead of hiding in the overflow menu. */}
      <div className="personal-waypoint-details-actions-row">
        <Button
          className="personal-waypoint-details-move-trigger"
          label="Move to category"
          icon={<MoveToCategoryIcon />}
          variant="secondary"
          onClick={() => setMoving((open) => !open)}
          expanded={moving}
          controls="personal-waypoint-move"
          disabled={!canManage}
        />
        {moving && <IconButton
          label="Cancel moving this waypoint"
          icon={<CloseIcon />}
          variant="plain"
          onClick={() => setMoving(false)}
        />}
      </div>
    </div>

    {moving && <div id="personal-waypoint-move" className="personal-waypoint-details-move">
      <ConnectedCategoryPicker
        label="Move to"
        value={waypoint.category}
        options={categories.filter((category) => category !== waypoint.category)}
        placeholder="Search or create a category"
        maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH}
        onSelect={(category) => {
          setMoving(false)
          onMove(category)
        }}
      />
    </div>}
  </section>
}

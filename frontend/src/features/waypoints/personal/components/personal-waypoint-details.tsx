import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { ChevronDownIcon, CompassIcon, EditIcon, EllipsisVerticalIcon, MapPinIcon, TrashIcon } from '../../../../ui/icons'
import { IconButton } from '../../../../ui/button'
import { MenuItem } from '../../../../ui/menu-item'
import { NavigateButton } from '../../../../ui/navigate-button'

export function PersonalWaypointDetails({ waypoint, canManage, onDirections, onEdit, onDelete }: {
  readonly waypoint: PersonalWaypoint | null
  readonly canManage: boolean
  readonly onDirections: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = (restoreFocus = true): void => {
    setMenuOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node | null)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [menuOpen])

  if (!waypoint) {
    return <p className="personal-waypoint-details-unavailable" role="status">
      This waypoint is no longer available in the saved list.
    </p>
  }

  return <section
    className="personal-waypoint-details"
    aria-labelledby="personal-waypoint-details-heading"
    ref={rootRef}
    data-menu-open={menuOpen ? 'true' : undefined}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !menuOpen) return
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
    }}
  >
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
      <div className="personal-waypoint-details-overflow">
        <IconButton
          className="personal-waypoint-details-overflow-trigger"
          label="More waypoint actions"
          title="More waypoint actions"
          icon={<EllipsisVerticalIcon />}
          expanded={menuOpen}
          controls="personal-waypoint-details-actions-menu"
          onClick={() => setMenuOpen((open) => !open)}
          ref={triggerRef}
        />
        {menuOpen && <div
          id="personal-waypoint-details-actions-menu"
          className="personal-waypoint-details-actions-menu"
          role="group"
          aria-label="Waypoint actions"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu(false)
          }}
        >
          <MenuItem
            label="Edit waypoint"
            icon={<EditIcon />}
            disabled={!canManage}
            onClick={() => {
              closeMenu()
              onEdit()
            }}
          />
          <MenuItem
            className="personal-waypoint-details-delete"
            label="Delete waypoint"
            icon={<TrashIcon />}
            disabled={!canManage}
            onClick={() => {
              closeMenu()
              onDelete()
            }}
          />
        </div>}
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
    </div>

    {!canManage && <p className="personal-waypoint-details-status" role="status">
      Editing and deleting are unavailable until saved data is recovered.
    </p>}

    <div className="personal-waypoint-details-actions">
      <NavigateButton className="personal-waypoint-details-navigate" onClick={onDirections} />
    </div>

    <details className="personal-waypoint-details-location-disclosure">
      <summary>
        <MapPinIcon size={16} />
        <span>Location</span>
        <span className="personal-waypoint-details-coordinate">
          {waypoint.coordinate.latitude.toFixed(6)}, {waypoint.coordinate.longitude.toFixed(6)}
        </span>
        <ChevronDownIcon size={16} />
      </summary>
      <dl className="personal-waypoint-details-location-fields">
        <div>
          <dt className="personal-waypoint-details-label">Latitude</dt>
          <dd>{waypoint.coordinate.latitude.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="personal-waypoint-details-label">Longitude</dt>
          <dd>{waypoint.coordinate.longitude.toFixed(6)}</dd>
        </div>
      </dl>
    </details>
  </section>
}

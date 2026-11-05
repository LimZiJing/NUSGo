import type { ReactNode } from 'react'
import { ChevronRightIcon, MapPinIcon, SettingsIcon, FileTextIcon } from '../../ui/icons'
import './more-menu.css'

/** Lists destinations while each destination screen stays with its owning feature. */
export function MoreMenu({ waypointCount, onOpenWaypoints, onOpenSettings, onOpenReleaseNotes, installSection }: {
  readonly installSection?: ReactNode
  readonly waypointCount: number | null
  readonly onOpenWaypoints: () => void
  readonly onOpenSettings: () => void
  readonly onOpenReleaseNotes: () => void
}) {
  const waypointSummary = waypointCount === null
    ? 'Saved in this browser profile'
    : `${waypointCount} saved ${waypointCount === 1 ? 'place' : 'places'}`

  return <div className="more-menu-content">
    <button
      type="button"
      className="more-menu-row"
      aria-label="My waypoints"
      aria-describedby="more-waypoints-summary"
      onClick={onOpenWaypoints}
    >
      <span className="more-menu-row-icon"><MapPinIcon /></span>
      <span className="more-menu-row-copy">
        <span>My waypoints</span>
        <span className="more-menu-row-description" id="more-waypoints-summary">{waypointSummary}</span>
      </span>
      <ChevronRightIcon />
    </button>
    <button
      type="button"
      className="more-menu-row"
      aria-label="Settings"
      aria-describedby="more-settings-summary"
      onClick={onOpenSettings}
    >
      <span className="more-menu-row-icon"><SettingsIcon /></span>
      <span className="more-menu-row-copy">
        <span>Settings</span>
        <span className="more-menu-row-description" id="more-settings-summary">Appearance and favourites</span>
      </span>
      <ChevronRightIcon />
    </button>
    <button type="button" className="more-menu-row" aria-label="Release notes" onClick={onOpenReleaseNotes}>
      <span className="more-menu-row-icon"><FileTextIcon /></span>
      <span className="more-menu-row-copy"><span>Release notes</span></span>
      <ChevronRightIcon />
    </button>
    {installSection}
  </div>
}

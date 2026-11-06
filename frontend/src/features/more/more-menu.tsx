import type { ReactNode } from 'react'
import { Button } from '../../ui/button'
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
    <Button
      className="more-menu-row"
      ariaLabel="My waypoints"
      ariaDescribedBy="more-waypoints-summary"
      onClick={onOpenWaypoints}
    >
      <span className="more-menu-row-icon menu-icon-tile"><MapPinIcon /></span>
      <span className="more-menu-row-copy">
        <span>My waypoints</span>
        <span className="more-menu-row-description" id="more-waypoints-summary">{waypointSummary}</span>
      </span>
      <ChevronRightIcon />
    </Button>
    <Button
      className="more-menu-row"
      ariaLabel="Settings"
      ariaDescribedBy="more-settings-summary"
      onClick={onOpenSettings}
    >
      <span className="more-menu-row-icon menu-icon-tile"><SettingsIcon /></span>
      <span className="more-menu-row-copy">
        <span>Settings</span>
        <span className="more-menu-row-description" id="more-settings-summary">Appearance and favourites</span>
      </span>
      <ChevronRightIcon />
    </Button>
    <Button className="more-menu-row" ariaLabel="Release notes" onClick={onOpenReleaseNotes}>
      <span className="more-menu-row-icon menu-icon-tile"><FileTextIcon /></span>
      <span className="more-menu-row-copy"><span>Release notes</span></span>
      <ChevronRightIcon />
    </Button>
    {installSection}
  </div>
}

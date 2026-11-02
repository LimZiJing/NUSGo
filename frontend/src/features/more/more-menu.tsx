import type { ReactNode } from 'react'
import { ChevronRightIcon, MapPinIcon, SettingsIcon } from '../../ui/icons'
import './more-menu.css'

/** Lists destinations while each destination screen stays with its owning feature. */
export function MoreMenu({ onOpenWaypoints, onOpenSettings, installSection }: {
  readonly installSection?: ReactNode
  readonly onOpenWaypoints: () => void
  readonly onOpenSettings: () => void
}) {
  return <div className="more-menu-content">
    <button type="button" className="more-menu-row" onClick={onOpenWaypoints}>
      <MapPinIcon /><span>My waypoints</span><ChevronRightIcon />
    </button>
    <button type="button" className="more-menu-row" onClick={onOpenSettings}>
      <SettingsIcon /><span>Settings</span><ChevronRightIcon />
    </button>
    {installSection}
  </div>
}
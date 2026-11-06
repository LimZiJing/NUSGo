import type { ReactNode, Ref } from 'react'
import { IconButton } from './button'
import { ArrowLeftIcon } from './icons'

export type MorePanelPage =
  | 'closed'
  | 'menu'
  | 'waypoints'
  | 'waypoint-details'
  | 'placing'
  | 'creating'
  | 'editing-waypoint'
  | 'settings'
  | 'release-notes'

interface MorePanelSurfaceProps {
  readonly page: MorePanelPage
  readonly title: string
  readonly statusMessage: string | null
  readonly statusRevision: number
  readonly headerAction?: ReactNode
  readonly initialFocusRef: Ref<HTMLButtonElement>
  readonly onClose: () => void
  readonly children: ReactNode
}

export function MorePanelSurface({
  page,
  title,
  statusMessage,
  statusRevision,
  headerAction,
  initialFocusRef,
  onClose,
  children,
}: MorePanelSurfaceProps) {
  const isMenu = page === 'menu'

  return (
    <div className={`more-panel-body${isMenu ? ' more-panel-body-menu' : ''}`}>
      {statusMessage && <p
        key={statusRevision}
        className="more-panel-status"
        role="status"
        aria-live="polite"
      >{statusMessage}</p>}
      <header className="more-panel-header">
        <IconButton
          label="Back to previous view"
          title="Back"
          icon={<ArrowLeftIcon />}
          variant="plain"
          ref={initialFocusRef}
          onClick={onClose}
        />
        <h2 id="more-panel-heading">{title}</h2>
        {headerAction}
      </header>
      <div className="more-panel-content-scroll" id="more-panel-scroll">
        {children}
      </div>
    </div>
  )
}

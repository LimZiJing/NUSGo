import type { ReactNode, Ref } from 'react'
import { BackButton } from './back-button'

export type MorePanelPage =
  | 'closed'
  | 'menu'
  | 'waypoints'
  | 'waypoint-details'
  | 'placing'
  | 'community-submission'
  | 'community-placing'
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
        <BackButton
          mode="header"
          label="Back to previous view"
          title="Back"
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

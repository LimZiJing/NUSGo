import type { ReactNode, Ref } from 'react'
import { ArrowLeftIcon, CloseIcon } from './icons'

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
        {isMenu ? <h2 id="more-panel-heading">{title}</h2> : (
          <>
            <button
              className="more-back-button"
              ref={initialFocusRef}
              type="button"
              aria-label="Back to previous view"
              title="Back"
              onClick={onClose}
            >
              <ArrowLeftIcon />
            </button>
            <h2 id="more-panel-heading">{title}</h2>
          </>
        )}
        {headerAction}
        {isMenu && <button
          className="more-close-button"
          ref={initialFocusRef}
          type="button"
          aria-label="Close More"
          title="Close More"
          onClick={onClose}
        >
          <CloseIcon />
        </button>}
      </header>
      <div className="more-panel-content-scroll" id="more-panel-scroll">
        {children}
      </div>
    </div>
  )
}

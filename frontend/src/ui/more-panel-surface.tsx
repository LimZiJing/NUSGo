import type { ReactNode, Ref } from 'react'
import { ArrowLeftIcon, CloseIcon } from './icons'

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
  readonly statusAction?: ReactNode
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
  statusAction,
  initialFocusRef,
  onClose,
  children,
}: MorePanelSurfaceProps) {
  const isMenu = page === 'menu'

  return (
    <div className={`more-panel-body${isMenu ? ' more-panel-body-menu' : ''}`}>
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true"><span key={statusRevision}>{statusMessage ?? ''}</span></p>
      {statusMessage && <div className="more-panel-status-row">
      <p
        className="more-panel-status"
        aria-hidden="true"
      >{statusMessage}</p>
      {statusAction}
      </div>}
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

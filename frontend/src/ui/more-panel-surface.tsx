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
  /** A short action attached to the status popup, such as Undo for the message it announces. */
  readonly statusAction?: ReactNode
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
  statusAction,
  headerAction,
  initialFocusRef,
  onClose,
  children,
}: MorePanelSurfaceProps) {
  const isMenu = page === 'menu'

  return (
    <div className={`more-panel-body${isMenu ? ' more-panel-body-menu' : ''}`}>
      {/* The message is the live region; the action sits beside it rather than inside it, so the
          announcement is the sentence alone and never the button's label. */}
      {statusMessage && <div className="more-panel-status-row">
        <p
          key={statusRevision}
          className="more-panel-status"
          role="status"
          aria-live="polite"
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

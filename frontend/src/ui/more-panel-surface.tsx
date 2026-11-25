import { useLayoutEffect, useRef, type ReactNode, type Ref } from 'react'
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
  readonly backButtonLabel?: string
  readonly scrollResetKey?: string | null
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
  backButtonLabel = 'Back to previous view',
  scrollResetKey,
  statusMessage,
  statusRevision,
  headerAction,
  initialFocusRef,
  onClose,
  children,
}: MorePanelSurfaceProps) {
  const isMenu = page === 'menu'
  const hasStatus = Boolean(statusMessage)
  const contentScrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    contentScrollRef.current?.scrollTo?.({ top: 0, behavior: 'instant' })
  }, [page, scrollResetKey])

  return (
    <div className={`more-panel-body${isMenu ? ' more-panel-body-menu' : ''}`}>
      {/* Keep the live region mounted so a message inserted later is announced; screen readers
          ignore a role=status that only appears together with its text. */}
      <p
        className="more-panel-status"
        role="status"
        aria-live="polite"
        data-empty={hasStatus ? 'false' : 'true'}
      >
        {statusMessage && <span key={statusRevision}>{statusMessage}</span>}
      </p>
      <header className="more-panel-header">
        <BackButton
          mode="header"
          label={backButtonLabel}
          title={backButtonLabel === 'Back to previous view' ? 'Back' : backButtonLabel}
          ref={initialFocusRef}
          onClick={onClose}
        />
        <h2 id="more-panel-heading">{title}</h2>
        {headerAction}
      </header>
      <div className="more-panel-content-scroll" id="more-panel-scroll" ref={contentScrollRef}>
        {children}
      </div>
    </div>
  )
}

import type { ReactNode, Ref } from 'react'
import { ArrowLeftIcon } from './icons'

interface MorePanelSurfaceProps {
  readonly open: boolean
  readonly title: string
  readonly initialFocusRef: Ref<HTMLButtonElement>
  readonly onClose: () => void
  readonly children: ReactNode
}

export function MorePanelSurface({
  open,
  title,
  initialFocusRef,
  onClose,
  children,
}: MorePanelSurfaceProps) {
  return (
    <section
      id="more-panel-content"
      className="navigation-panel more-panel-surface"
      aria-labelledby="more-panel-heading"
      aria-hidden={!open}
      inert={!open}
      data-open={open ? 'true' : 'false'}
    >
      <div className="more-panel-body">
        <header className="more-panel-header">
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
        </header>
        <div className="more-panel-content-scroll" id="more-panel-scroll">
          {children}
        </div>
      </div>
    </section>
  )
}

import type { ReactNode, Ref } from 'react'
import { ArrowLeftIcon } from './icons'

interface SettingsSurfaceProps {
  readonly open: boolean
  readonly headingRef: Ref<HTMLHeadingElement>
  readonly onClose: () => void
  readonly children: ReactNode
}

export function SettingsSurface({
  open,
  headingRef,
  onClose,
  children,
}: SettingsSurfaceProps) {
  return (
    <section
      id="settings-panel-content"
      className="navigation-panel settings-surface"
      aria-labelledby="settings-heading"
      aria-hidden={!open}
      inert={!open}
      data-open={open ? 'true' : 'false'}
    >
      <div className="settings-surface-body">
        <header className="settings-surface-header">
          <button
            className="settings-back-button"
            type="button"
            aria-label="Back to previous view"
            title="Back"
            onClick={onClose}
          >
            <ArrowLeftIcon />
          </button>
          <h2 id="settings-heading" tabIndex={-1} ref={headingRef}>Settings</h2>
        </header>
        <div className="settings-content-scroll" id="settings-content">
          {children}
        </div>
      </div>
    </section>
  )
}

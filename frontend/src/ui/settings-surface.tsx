import type { ReactNode, Ref } from 'react'
import { CloseIcon } from './icons'

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
          <h2 id="settings-heading" tabIndex={-1} ref={headingRef}>Settings</h2>
          <button
            className="settings-close-button"
            type="button"
            aria-label="Close Settings"
            title="Close Settings"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="settings-content-scroll" id="settings-content">
          {children}
        </div>
      </div>
    </section>
  )
}

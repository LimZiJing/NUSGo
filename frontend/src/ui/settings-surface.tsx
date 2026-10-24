import type { ReactNode, Ref } from 'react'
import { ArrowLeftIcon } from './icons'

interface SettingsSurfaceProps {
  readonly open: boolean
  readonly initialFocusRef: Ref<HTMLButtonElement>
  readonly onClose: () => void
  readonly children: ReactNode
}

export function SettingsSurface({
  open,
  initialFocusRef,
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
            ref={initialFocusRef}
            type="button"
            aria-label="Back to previous view"
            title="Back"
            onClick={onClose}
          >
            <ArrowLeftIcon />
          </button>
          <h2 id="settings-heading">Settings</h2>
        </header>
        <div className="settings-content-scroll" id="settings-content">
          {children}
        </div>
      </div>
    </section>
  )
}

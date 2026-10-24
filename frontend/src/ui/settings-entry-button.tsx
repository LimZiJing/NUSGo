import type { Ref } from 'react'
import { SettingsIcon } from './icons'

interface SettingsEntryButtonProps {
  readonly expanded: boolean
  readonly buttonRef?: Ref<HTMLButtonElement>
  readonly onClick: () => void
}

export function SettingsEntryButton({
  expanded,
  buttonRef,
  onClick,
}: SettingsEntryButtonProps) {
  return (
    <button
      className="settings-entry-button"
      type="button"
      aria-label="Settings"
      aria-expanded={expanded}
      aria-controls="settings-panel"
      title="Settings"
      ref={buttonRef}
      onClick={onClick}
    >
      <SettingsIcon className="settings-entry-icon" />
    </button>
  )
}

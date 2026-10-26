import type { Ref } from 'react'
import { EllipsisVerticalIcon } from './icons'

interface MoreEntryButtonProps {
  readonly expanded: boolean
  readonly buttonRef?: Ref<HTMLButtonElement>
  readonly onClick: () => void
}

export function MoreEntryButton({
  expanded,
  buttonRef,
  onClick,
}: MoreEntryButtonProps) {
  return (
    <button
      className="more-entry-button map-overlay-button"
      type="button"
      aria-label="More"
      aria-expanded={expanded}
      aria-controls="more-panel"
      title="More"
      ref={buttonRef}
      onClick={onClick}
    >
      <EllipsisVerticalIcon className="more-entry-icon" />
    </button>
  )
}

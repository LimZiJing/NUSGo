import type { Ref } from 'react'
import { EllipsisVerticalIcon } from './icons'
import { MapOverlayIconButton } from './map-overlay-icon-button'

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
    <MapOverlayIconButton
      className="more-entry-button"
      label="More"
      title="More"
      icon={<EllipsisVerticalIcon />}
      expanded={expanded}
      controls="more-panel"
      ref={buttonRef}
      onClick={onClick}
    />
  )
}

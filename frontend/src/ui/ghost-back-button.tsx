import type { Ref } from 'react'
import { Button } from './button'
import { ArrowLeftIcon } from './icons'

interface GhostBackButtonProps {
  readonly label: string
  readonly onClick: () => void
  /** Callers that restore focus to the Back control pass their own ref. */
  readonly ref?: Ref<HTMLButtonElement>
}

export function GhostBackButton({ label, onClick, ref }: GhostBackButtonProps) {
  return (
    <Button
      className="ghost-back-button"
      variant="ghost"
      icon={<ArrowLeftIcon />}
      label={label}
      onClick={onClick}
      ref={ref}
    />
  )
}

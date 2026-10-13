import { Button } from './button'
import { ArrowLeftIcon } from './icons'

interface GhostBackButtonProps {
  readonly label: string
  readonly onClick: () => void
}

export function GhostBackButton({ label, onClick }: GhostBackButtonProps) {
  return (
    <Button
      className="ghost-back-button"
      variant="ghost"
      icon={<ArrowLeftIcon />}
      label={label}
      onClick={onClick}
    />
  )
}

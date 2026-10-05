import { ArrowLeftIcon } from './icons'

interface GhostBackButtonProps {
  readonly label: string
  readonly onClick: () => void
}

export function GhostBackButton({ label, onClick }: GhostBackButtonProps) {
  return (
    <button type="button" className="ghost-back-button" onClick={onClick}>
      <ArrowLeftIcon />
      {label}
    </button>
  )
}

interface GhostBackButtonProps {
  readonly label: string
  readonly onClick: () => void
}

export function GhostBackButton({ label, onClick }: GhostBackButtonProps) {
  return (
    <button type="button" className="mobile-ghost-back-button" onClick={onClick}>
      <span aria-hidden="true">←</span> {label}
    </button>
  )
}

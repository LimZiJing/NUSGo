interface GhostBackButtonProps {
  readonly label: string
  readonly onClick: () => void
}

export function GhostBackButton({ label, onClick }: GhostBackButtonProps) {
  return (
    <button type="button" className="ghost-back-button" onClick={onClick}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M19 12H5m7-7-7 7 7 7" />
      </svg>
      {label}
    </button>
  )
}

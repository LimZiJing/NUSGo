interface NavigateButtonProps {
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly ariaLabel?: string
}

export function NavigateButton({ onClick, disabled, ariaLabel }: NavigateButtonProps) {
  return (
    <button
      className="navigate-button"
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="m4 20 7-17 3 8 8 3-18 6Z" />
      </svg>
      <span>Navigate</span>
    </button>
  )
}

import { NavigationIcon } from './icons'

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
      <NavigationIcon />
      <span>Navigate</span>
    </button>
  )
}

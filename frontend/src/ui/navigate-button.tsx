import { Button } from './button'
import { NavigationIcon } from './icons'

interface NavigateButtonProps {
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly ariaLabel?: string
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
}

export function NavigateButton({ onClick, disabled, ariaLabel, className }: NavigateButtonProps) {
  return (
    <Button
      className={className === undefined ? 'navigate-button' : `navigate-button ${className}`}
      variant="primary"
      icon={<NavigationIcon />}
      label="Navigate"
      disabled={disabled}
      ariaLabel={ariaLabel}
      onClick={onClick}
    />
  )
}

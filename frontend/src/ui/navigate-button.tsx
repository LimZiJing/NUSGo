import { Button } from './button'
import { NavigationIcon } from './icons'

interface NavigateButtonProps {
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly ariaLabel?: string
}

export function NavigateButton({ onClick, disabled, ariaLabel }: NavigateButtonProps) {
  return (
    <Button
      className="navigate-button"
      variant="primary"
      icon={<NavigationIcon />}
      label="Navigate"
      disabled={disabled}
      ariaLabel={ariaLabel}
      onClick={onClick}
    />
  )
}

import type { ReactNode, Ref } from 'react'
import { joinClassNames } from './class-names'

export type ControlSize = 'sm' | 'lg'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
  readonly label: string
  readonly onClick: () => void
  readonly variant?: ButtonVariant
  readonly size?: ControlSize
  readonly icon?: ReactNode
  readonly disabled?: boolean
  readonly pressed?: boolean
  readonly ariaLabel?: string
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

interface IconButtonProps {
  readonly label: string
  readonly icon: ReactNode
  readonly onClick: () => void
  readonly variant?: ButtonVariant
  readonly size?: ControlSize
  readonly disabled?: boolean
  readonly pressed?: boolean
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

export function Button({
  label,
  onClick,
  variant = 'secondary',
  size = 'sm',
  icon,
  disabled,
  pressed,
  ariaLabel,
  className,
  ref,
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={joinClassNames('button', className)}
      type="button"
      data-variant={variant}
      data-size={size}
      data-hover-filter="none"
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function IconButton({
  label,
  icon,
  onClick,
  variant = 'secondary',
  size = 'sm',
  disabled,
  pressed,
  className,
  ref,
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      className={joinClassNames('button', 'icon-button', className)}
      type="button"
      data-variant={variant}
      data-size={size}
      data-hover-filter="none"
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

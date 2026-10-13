import type { ReactNode, Ref } from 'react'
import { joinClassNames } from './class-names'

export type ControlSize = 'sm' | 'lg'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
/** `plain` is icon-only: no box at rest, hover or when pressed, for toggles such as a favourite star. */
export type IconButtonVariant = ButtonVariant | 'plain'

interface ButtonProps {
  readonly label: string
  readonly onClick: () => void
  readonly variant?: ButtonVariant
  readonly size?: ControlSize
  readonly icon?: ReactNode
  readonly trailingIcon?: ReactNode
  readonly disabled?: boolean
  readonly pressed?: boolean
  readonly ariaLabel?: string
  /** Hover text for controls whose icon needs a tooltip. */
  readonly title?: string
  /** Announces that the control opens or closes the element named by `controls`. */
  readonly expanded?: boolean
  readonly controls?: string
  /** Announces that the action is in progress. */
  readonly busy?: boolean
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

interface IconButtonProps {
  readonly label: string
  readonly icon: ReactNode
  readonly onClick: () => void
  readonly variant?: IconButtonVariant
  readonly size?: ControlSize
  readonly disabled?: boolean
  readonly pressed?: boolean
  /** Hover text for controls whose icon needs a tooltip. */
  readonly title?: string
  /** Announces that the control opens or closes the element named by `controls`. */
  readonly expanded?: boolean
  readonly controls?: string
  /** Announces that the action is in progress. */
  readonly busy?: boolean
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
  trailingIcon,
  disabled,
  pressed,
  ariaLabel,
  title,
  expanded,
  controls,
  busy,
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
      title={title}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-busy={busy}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {trailingIcon}
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
  title,
  expanded,
  controls,
  busy,
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
      title={title}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-busy={busy}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

import type { KeyboardEventHandler, PointerEventHandler, ReactNode, Ref } from 'react'
import { joinClassNames } from './class-names'

export type ControlSize = 'sm' | 'lg'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
/** `plain` is icon-only: no box at rest, hover or when pressed, for toggles such as a favourite star. */
export type IconButtonVariant = ButtonVariant | 'plain'

interface ButtonProps {
  readonly label: string
  /** Omitted by a submit button, which is driven by its surrounding form instead. */
  readonly onClick?: () => void
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
  readonly onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  readonly ariaDescribedBy?: string
  readonly ariaKeyShortcuts?: string
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
  /** `submit` lets the button send its surrounding form; defaults to `button`. */
  readonly type?: 'button' | 'submit'
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
  readonly onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  /** Press lifecycle for gestures the browser cannot report through `:active`. */
  readonly onPointerDown?: PointerEventHandler<HTMLButtonElement>
  readonly onPointerUp?: PointerEventHandler<HTMLButtonElement>
  readonly onPointerCancel?: PointerEventHandler<HTMLButtonElement>
  readonly ariaDescribedBy?: string
  readonly ariaKeyShortcuts?: string
  readonly dataKeyboardReordering?: boolean
  /**
   * Marks the control as excluded from an enclosing swipe-dismissable sheet's gesture, for a
   * control that starts its own drag. Base UI reads this attribute by name.
   */
  readonly dataBaseUiSwipeIgnore?: boolean
  /** Raised while the control is held down, for gestures the browser's own `:active` cannot see. */
  readonly pressedDown?: boolean
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
  onKeyDown,
  ariaDescribedBy,
  ariaKeyShortcuts,
  className,
  ref,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={joinClassNames('button', className)}
      type={type}
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
      aria-describedby={ariaDescribedBy}
      aria-keyshortcuts={ariaKeyShortcuts}
      onClick={onClick}
      onKeyDown={onKeyDown}
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
  onKeyDown,
  ariaDescribedBy,
  ariaKeyShortcuts,
  dataKeyboardReordering,
  dataBaseUiSwipeIgnore,
  pressedDown,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
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
      aria-describedby={ariaDescribedBy}
      aria-keyshortcuts={ariaKeyShortcuts}
      data-keyboard-reordering={dataKeyboardReordering ? 'true' : undefined}
      data-base-ui-swipe-ignore={dataBaseUiSwipeIgnore ? '' : undefined}
      data-pressed-down={pressedDown ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {icon}
    </button>
  )
}

import type { ButtonHTMLAttributes, KeyboardEventHandler, MouseEventHandler, ReactNode, Ref } from 'react'
import { joinClassNames } from './class-names'

export type ControlSize = 'sm' | 'lg'
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
/** `plain` is icon-only: no box at rest, hover or when pressed, for toggles such as a favourite star. */
export type IconButtonVariant = ButtonVariant | 'plain'

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'children'
  | 'type'
  | 'onClick'
  | 'onKeyDown'
  | 'className'
  | 'disabled'
  | 'title'
  | 'aria-label'
  | 'aria-pressed'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-busy'
  | 'aria-describedby'
  | 'aria-keyshortcuts'
>
interface ButtonOptions extends NativeButtonProps {
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
}

type ButtonProps = ButtonOptions
  & (
    | { readonly label: string; readonly children?: never }
    | { readonly label?: never; readonly children: ReactNode }
  )
  & (
    | { readonly type?: 'button' | 'reset'; readonly onClick: MouseEventHandler<HTMLButtonElement> }
    | { readonly type: 'submit'; readonly onClick?: MouseEventHandler<HTMLButtonElement> }
  )

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
  readonly ariaDescribedBy?: string
  readonly ariaKeyShortcuts?: string
  readonly dataKeyboardReordering?: boolean
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

export function Button({
  label,
  children,
  onClick,
  type = 'button',
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
  ...nativeProps
}: ButtonProps) {
  return (
    <button
      {...nativeProps}
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
      {children ?? <>
        {icon}
        <span>{label}</span>
        {trailingIcon}
      </>}
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
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {icon}
    </button>
  )
}

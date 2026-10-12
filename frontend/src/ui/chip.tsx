import type { CSSProperties, Ref } from 'react'
import type { ControlSize } from './button'
import { joinClassNames } from './class-names'

export interface ChipTone {
  readonly fill: string
  readonly text: string
}

type ChipDataAttributes = Readonly<Record<`data-${string}`, string | undefined>>

interface ChipProps {
  readonly label: string
  readonly onClick: () => void
  readonly size?: ControlSize
  /** Toggle state, announced through aria-pressed. Leave undefined for a chip that is not a toggle. */
  readonly pressed?: boolean
  /** Selected appearance; defaults to the pressed state. */
  readonly selected?: boolean
  /** Fill and text colours for the selected appearance, such as an official route colour. */
  readonly tone?: ChipTone
  readonly disabled?: boolean
  readonly ariaLabel?: string
  readonly title?: string
  /** Identity hooks such as data-focus-id; not for styling. */
  readonly dataAttributes?: ChipDataAttributes
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

export function Chip({
  label,
  onClick,
  size = 'sm',
  pressed,
  selected = pressed,
  tone,
  disabled,
  ariaLabel,
  title,
  dataAttributes,
  className,
  ref,
}: ChipProps) {
  return (
    <button
      {...dataAttributes}
      ref={ref}
      className={joinClassNames('chip', className)}
      type="button"
      data-size={size}
      data-selected={selected ? 'true' : undefined}
      data-hover-filter="none"
      style={tone ? { '--chip-tone': tone.fill, '--chip-tone-text': tone.text } as CSSProperties : undefined}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

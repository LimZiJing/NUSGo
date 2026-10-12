import { joinClassNames } from './class-names'

export type PillTone = 'neutral' | 'success'

interface PillProps {
  readonly label: string
  readonly tone?: PillTone
  readonly leadingDot?: boolean
  /** Layout only, such as alignment or flex sizing; the look comes from the props and tokens. */
  readonly className?: string
}

/** A non-interactive status label. Use Chip for anything a person can press. */
export function Pill({ label, tone = 'neutral', leadingDot = false, className }: PillProps) {
  return (
    <span
      className={joinClassNames('pill', className)}
      data-tone={tone}
      data-leading-dot={leadingDot || undefined}
    >
      {label}
    </span>
  )
}

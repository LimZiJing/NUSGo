import { joinClassNames } from './class-names'

export type StatusDotTone = 'success' | 'error' | 'muted'

interface StatusDotProps {
  /** Read out in place of the colour, so the status never relies on colour alone. */
  readonly label: string
  readonly tone?: StatusDotTone
  /** Pulses the dot to show something is in progress. */
  readonly pulse?: boolean
  /** Layout only, such as grid placement; the look comes from the props and tokens. */
  readonly className?: string
}

/** A compact, non-interactive status light. Use Pill when there is room for a text label. */
export function StatusDot({ label, tone = 'muted', pulse = false, className }: StatusDotProps) {
  return (
    <span
      className={joinClassNames('status-dot', className)}
      role="img"
      aria-label={label}
      data-tone={tone}
      data-pulse={pulse || undefined}
    />
  )
}

import type { ReactNode } from 'react'

interface GroupedListProps {
  readonly ariaLabel: string
  readonly className?: string
  readonly children: ReactNode
}

export function GroupedList({ ariaLabel, className, children }: GroupedListProps) {
  const classes = ['grouped-list', className].filter(Boolean).join(' ')

  return (
    <ul className={classes} aria-label={ariaLabel}>
      {children}
    </ul>
  )
}

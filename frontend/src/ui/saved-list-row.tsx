import type { ReactNode } from 'react'
import './saved-list-row.css'

interface SavedListRowProps {
  readonly leading: ReactNode
  readonly title: string
  readonly subtitle?: string
  readonly trailing?: ReactNode
  readonly density?: 'compact' | 'regular'
  readonly className?: string
}

export function SavedListRow({
  leading,
  title,
  subtitle,
  trailing,
  density = 'regular',
  className,
}: SavedListRowProps) {
  return (
    <li className={['saved-list-row', className].filter(Boolean).join(' ')} data-density={density}>
      <div className="saved-list-row-leading">{leading}</div>
      <div className="saved-list-row-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {trailing}
    </li>
  )
}

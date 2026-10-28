import type { MouseEvent, ReactNode } from 'react'
import './saved-list-row.css'

interface SavedListRowProps {
  readonly leading: ReactNode
  readonly title: string
  readonly subtitle?: string
  readonly trailing?: ReactNode
  readonly density?: 'compact' | 'regular'
  readonly className?: string
  readonly onSelect?: (event: MouseEvent<HTMLButtonElement>) => void
  readonly selectLabel?: string
}

export function SavedListRow({
  leading,
  title,
  subtitle,
  trailing,
  density = 'regular',
  className,
  onSelect,
  selectLabel,
}: SavedListRowProps) {
  const copy = <>
    <strong>{title}</strong>
    {subtitle && <span>{subtitle}</span>}
  </>

  return (
    <li className={['saved-list-row', className].filter(Boolean).join(' ')} data-density={density}>
      <div className="saved-list-row-leading">{leading}</div>
      {onSelect ? (
        <button
          className="saved-list-row-copy saved-list-row-select"
          type="button"
          aria-label={selectLabel ?? [title, subtitle].filter(Boolean).join(', ')}
          onClick={onSelect}
        >
          {copy}
        </button>
      ) : <div className="saved-list-row-copy">{copy}</div>}
      {trailing}
    </li>
  )
}

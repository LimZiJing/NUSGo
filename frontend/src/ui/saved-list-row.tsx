import type { MouseEvent, ReactNode, Ref } from 'react'
import './saved-list-row.css'

interface SavedListRowProps {
  readonly leading: ReactNode
  readonly title: string
  readonly subtitle?: string
  readonly trailing?: ReactNode
  readonly children?: ReactNode
  readonly density?: 'compact' | 'regular'
  readonly className?: string
  readonly rowRef?: Ref<HTMLLIElement>
  readonly onSelect?: (event: MouseEvent<HTMLButtonElement>) => void
  readonly selectLabel?: string
}

export function SavedListRow({
  leading,
  title,
  subtitle,
  trailing,
  children,
  density = 'regular',
  className,
  rowRef,
  onSelect,
  selectLabel,
}: SavedListRowProps) {
  const copy = <>
    <strong>{title}</strong>
    {subtitle && <span>{subtitle}</span>}
  </>

  return (
    <li
      ref={rowRef}
      className={['saved-list-row', className].filter(Boolean).join(' ')}
      data-density={density}
    >
      <div className="saved-list-row-leading">{leading}</div>
      {onSelect ? (
        <button
          className="saved-list-row-copy saved-list-row-select"
          type="button"
          data-hover-filter="none"
          aria-label={selectLabel ?? [title, subtitle].filter(Boolean).join(', ')}
          onClick={onSelect}
        >
          {copy}
        </button>
      ) : <div className="saved-list-row-copy">{copy}</div>}
      {trailing}
      {children}
    </li>
  )
}

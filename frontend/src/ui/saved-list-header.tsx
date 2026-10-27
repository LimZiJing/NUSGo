import type { ReactNode } from 'react'
import './saved-list-header.css'

interface SavedListHeaderProps {
  readonly title: string
  readonly count: number
  readonly trailing?: ReactNode
  readonly headingId?: string
}

export function SavedListHeader({ title, count, trailing, headingId }: SavedListHeaderProps) {
  return (
    <header className="saved-list-header">
      <h3
        id={headingId}
        className="saved-list-header-title"
        aria-label={`${title} ${count}`}
      >
        <span>{title}</span>
        <span className="saved-list-header-count">{count}</span>
      </h3>
      {trailing && <div className="saved-list-header-trailing">{trailing}</div>}
    </header>
  )
}

import type { ReactNode, Ref } from 'react'
import './saved-list-header.css'

interface SavedListHeaderProps {
  readonly title: string
  readonly count: number
  readonly trailing?: ReactNode
  readonly headingId?: string
  readonly headingRef?: Ref<HTMLHeadingElement>
}

export function SavedListHeader({ title, count, trailing, headingId, headingRef }: SavedListHeaderProps) {
  return (
    <header className="saved-list-header">
      <h3
        ref={headingRef}
        id={headingId}
        className="saved-list-header-title"
        aria-label={`${title} ${count}`}
        tabIndex={-1}
      >
        <span>{title}</span>
        <span className="saved-list-header-count">{count}</span>
      </h3>
      {trailing && <div className="saved-list-header-trailing">{trailing}</div>}
    </header>
  )
}

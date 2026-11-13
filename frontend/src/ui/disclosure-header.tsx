import type { ReactNode } from 'react'
import { DisclosureChevron } from './disclosure-chevron'

interface DisclosureHeaderProps {
  /** Visible group name; also the control's accessible name. */
  readonly label: string
  /** Short trailing detail such as a place count, rendered once and never duplicated. */
  readonly detail?: string
  readonly expanded: boolean
  /** DOM id of the region this header controls, for `aria-controls`. */
  readonly controls?: string
  /** When set, the header is read-only and the toggle does nothing. */
  readonly expandDisabled?: boolean
  readonly onToggle: () => void
  readonly id?: string
  /** Optional trailing content, such as a menu, kept outside the toggle hit area. */
  readonly trailing?: ReactNode
}

/**
 * A group header that expands and collapses in place. The whole heading row is the toggle, so
 * tapping the category name does the same thing as tapping the chevron — a heading is a disclosure,
 * not a link to another screen.
 */
export function DisclosureHeader({
  label,
  detail,
  expanded,
  controls,
  expandDisabled = false,
  onToggle,
  id,
  trailing,
}: DisclosureHeaderProps) {
  return (
    <div className="disclosure-header">
      <button
        id={id}
        type="button"
        className="disclosure-header-toggle"
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        aria-disabled={expandDisabled || undefined}
        onClick={expandDisabled ? undefined : onToggle}
      >
        <span className="disclosure-header-label">{label}</span>
        {detail && <span className="disclosure-header-detail">{detail}</span>}
        <DisclosureChevron expanded={expanded} />
      </button>
      {trailing}
    </div>
  )
}

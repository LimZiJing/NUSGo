import type { MouseEvent } from 'react'
import { DisclosureChevron } from './disclosure-chevron'

interface DisclosureHeaderProps {
  /** Visible group name; also the first half of the accessible name. */
  readonly label: string
  /** Short trailing detail such as a place count, rendered once and never duplicated. */
  readonly detail?: string
  readonly expanded: boolean
  /** DOM id of the region this header controls, for `aria-controls`. */
  readonly controls?: string
  /** Disables only the expand/collapse action; the row stays readable. */
  readonly expandDisabled?: boolean
  readonly onToggle: () => void
  readonly onOpen?: (event: MouseEvent<HTMLButtonElement>) => void
  readonly openLabel?: string
  readonly id?: string
}

/**
 * A group header that expands in place and, when `onOpen` is supplied, also opens the group's own
 * view. One control carries both jobs so a list never needs a second menu button beside the name:
 * the chevron button toggles, and a separate text button with the same name opens.
 *
 * Only the chevron button toggles; the group name is a button of its own so a heading can navigate
 * without stealing the expand/collapse affordance from keyboard users.
 */
export function DisclosureHeader({
  label,
  detail,
  expanded,
  controls,
  expandDisabled = false,
  onToggle,
  onOpen,
  openLabel,
  id,
}: DisclosureHeaderProps) {
  const accessibleOpenLabel = openLabel ?? `Open ${label}`

  return (
    <div className="disclosure-header">
      {onOpen
        ? <button id={id} type="button" className="disclosure-header-open" aria-label={accessibleOpenLabel} onClick={onOpen}>
          <span className="disclosure-header-label">{label}</span>
          {detail && <span className="disclosure-header-detail">{detail}</span>}
        </button>
        : <span id={id} className="disclosure-header-static">
          <span className="disclosure-header-label">{label}</span>
          {detail && <span className="disclosure-header-detail">{detail}</span>}
        </span>}
      <button
        type="button"
        className="disclosure-header-toggle"
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        aria-disabled={expandDisabled || undefined}
        onClick={expandDisabled ? undefined : onToggle}
      >
        <DisclosureChevron expanded={expanded} />
      </button>
    </div>
  )
}

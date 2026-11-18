import { useRef, useState } from 'react'
import { CheckIcon, CloseIcon, EditIcon } from './icons'
import { IconButton } from './button'
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
  /**
   * Enables inline renaming. Given, the heading gains a rename action in the trailing position;
   * the caller owns what a committed name means (including merging into an existing category).
   */
  readonly onRename?: (next: string) => void
}

const MAX_RENAME_LENGTH = 40

/**
 * A group header that expands and collapses in place. The whole heading row is the toggle, so
 * tapping the category name does the same thing as tapping the chevron — a heading is a disclosure,
 * not a link to another screen.
 *
 * When `onRename` is supplied the heading also offers an inline rename: the name becomes a text
 * field with tick/cross actions, the current text preselected so typing replaces it, Enter commits
 * and Escape cancels.
 */
export function DisclosureHeader({
  label,
  detail,
  expanded,
  controls,
  expandDisabled = false,
  onToggle,
  id,
  onRename,
}: DisclosureHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const renameTriggerRef = useRef<HTMLButtonElement>(null)
  const renaming = draft !== null

  const startRename = (): void => {
    setDraft(label)
    setAnnouncement('')
    // Focus and selection happen after the field is in the DOM.
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.select()
    })
  }

  const cancelRename = (): void => {
    setDraft(null)
    setAnnouncement(`Kept ${label}.`)
    requestAnimationFrame(() => renameTriggerRef.current?.focus())
  }

  const commitRename = (): void => {
    const next = (draft ?? '').trim()
    setDraft(null)
    if (!next || next === label) {
      setAnnouncement(next === label ? `Kept ${label}.` : '')
      requestAnimationFrame(() => renameTriggerRef.current?.focus())
      return
    }
    onRename?.(next)
  }

  return (
    <div
      className="disclosure-header"
      // Renaming owns Escape, so the panel behind it stays put. The application listens for Escape
      // on `window` in the capture phase, which runs before this handler; without the opt-out it
      // would step the whole More panel back and throw away the pending edit instead of cancelling
      // the rename. The same contract as the overflow menu and the confirm dialog.
      data-owns-escape={renaming ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !renaming) return
        event.preventDefault()
        event.stopPropagation()
        cancelRename()
      }}
    >
      {renaming ? (
        <div className="disclosure-header-rename">
          <input
            ref={inputRef}
            className="disclosure-header-rename-input"
            aria-label={`Rename ${label} category`}
            value={draft ?? ''}
            maxLength={MAX_RENAME_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commitRename()
            }}
          />
          <IconButton label={`Save ${label} category name`} icon={<CheckIcon />} variant="plain" onClick={commitRename} />
          <IconButton label={`Cancel renaming ${label}`} icon={<CloseIcon />} variant="plain" onClick={cancelRename} />
        </div>
      ) : <>
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
        {onRename && <IconButton
          className="disclosure-header-rename-trigger"
          label={`Rename ${label} category`}
          icon={<EditIcon />}
          variant="plain"
          ref={renameTriggerRef}
          onClick={startRename}
        />}
      </>}
      {announcement && <span className="visually-hidden" role="status">{announcement}</span>}
    </div>
  )
}

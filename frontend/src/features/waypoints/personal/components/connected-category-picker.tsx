import { useEffect, useId, useRef, useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { ChevronDownIcon } from '../../../../ui/icons'
import './connected-category-picker.css'

interface ConnectedCategoryPickerProps {
  /** Visible label; also the field's accessible name. */
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
  /**
   * Called only when the person explicitly chooses something: an existing option, or the Create
   * result. Typing alone never calls it, so a half-typed category cannot be saved by accident.
   */
  readonly onSelect: (category: string) => void
  readonly disabled?: boolean
  readonly maxLength?: number
  /** Shown only while the list is open and the query is empty. */
  readonly placeholder?: string
}

/**
 * A text field for a category that also offers searchable suggestions and an explicit Create
 * result. The results panel extends from the field with no gap, sharing its surface and outer
 * outline, so it reads as one control rather than a floating list.
 *
 * Closed, the field displays the category that is set. Opening it clears the field to a search box,
 * so searching and creating start from nothing instead of from the existing name. The current value
 * is never repeated as separate text: the field itself is the display.
 *
 * This is the only category input in the app, so the waypoint form cannot drift from any other use.
 */
export function ConnectedCategoryPicker({
  label,
  value,
  options,
  onSelect,
  disabled = false,
  maxLength,
  placeholder = 'Search or create a category',
}: ConnectedCategoryPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const inputId = useId()
  const labelRef = useRef<HTMLLabelElement>(null)
  // Set when a press that is dismissing the list lands on our own label. That press must end as a
  // dismissal, so the focus the label forwards into the field is not allowed to reopen the list.
  const labelPressDismisses = useRef(false)

  const trimmedQuery = query.trim()
  const createLabel = trimmedQuery ? `Create “${trimmedQuery}”` : ''
  const matches = filtering
    ? options.filter((option) => option.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()))
    : options
  const canCreate = filtering
    && trimmedQuery.length > 0
    && !options.some((option) => option.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase())

  // The label is outside the field group, so pressing it counts as an outside press and closes the
  // list — but the label is bound to the field, so the same press then forwards focus into the
  // input, where opening on focus reopened the list. One press therefore collapsed and immediately
  // restored it. Base UI dismisses from a document-level listener and React's handlers run after
  // that, so the press is recorded at the window in the capture phase, which is the only moment the
  // list is still open and the press can be attributed. The listener exists only while it can mean
  // something, so a press that arrives when the list is already closed is never misread.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      // Recomputing rather than only setting means a press anywhere else clears a flag left behind
      // by a label press that never went on to move focus.
      labelPressDismisses.current = labelRef.current?.contains(event.target as Node) === true
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  const changeOpen = (next: boolean): void => {
    setOpen(next)
    if (next) labelPressDismisses.current = false
    // Closing always abandons a half-typed query, so the field falls back to showing the chosen
    // category. Only an explicit choice ever changes the value.
    if (!next) {
      setQuery('')
      setFiltering(false)
    }
  }

  const commit = (category: string): void => {
    onSelect(category)
    setQuery('')
    setFiltering(false)
    setOpen(false)
  }

  // Closed, the field shows the category that is actually set. Opened, it empties so the person can
  // search or type a new name; the current value is no longer repeated as separate text beneath.
  const displayValue = open ? query : value

  // `data-owns-escape` is the app's existing contract for a popup that handles Escape itself.
  // Without it the More panel's capture-phase Escape listener closes the whole form while the
  // person only meant to dismiss the list.
  return <div
    className="connected-category-picker"
    data-open={open ? 'true' : 'false'}
    data-owns-escape={open ? 'true' : undefined}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      // Closing the list must not also leave the form, and the field returns to the set category.
      event.preventDefault()
      event.stopPropagation()
      changeOpen(false)
    }}
  >
    <label
      className="connected-category-picker-label"
      htmlFor={inputId}
      ref={labelRef}
    >{label}</label>
    <Autocomplete.Root
      items={matches}
      value={displayValue}
      disabled={disabled}
      open={open}
      onOpenChange={changeOpen}
      onValueChange={(next, details) => {
        setQuery(next)
        // Only input edits narrow the list; choosing an option goes through `onSelect`.
        setFiltering(details.reason === 'input-change')
      }}
      openOnInputClick
    >
      <Autocomplete.InputGroup className="connected-category-picker-group">
        <Autocomplete.Input
          id={inputId}
          className="connected-category-picker-input"
          aria-label={label}
          maxLength={maxLength}
          placeholder={placeholder}
          onFocus={() => {
            // A press on our own label closed the list and then forwarded focus here. Reopening
            // would undo the dismissal the person just made, so this one focus is left alone.
            if (labelPressDismisses.current) {
              labelPressDismisses.current = false
              return
            }
            changeOpen(true)
          }}
        />
        <Autocomplete.Trigger className="connected-category-picker-trigger" aria-label={`Show ${label.toLowerCase()} options`} disabled={disabled}>
          <ChevronDownIcon size={16} />
        </Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="connected-category-picker-positioner" sideOffset={-1}>
          <Autocomplete.Popup className="connected-category-picker-popup">
            {/* "No matches" would be misleading while a Create action is offered, because typing a
                new name is a valid way to proceed. */}
            {!canCreate && <Autocomplete.Empty>
              <div className="connected-category-picker-empty">No matches</div>
            </Autocomplete.Empty>}
            <Autocomplete.List className="connected-category-picker-list">
              {(option: string) => <Autocomplete.Item
                key={option}
                value={option}
                className="connected-category-picker-item"
                onClick={() => commit(option)}
              >
                {option}
              </Autocomplete.Item>}
            </Autocomplete.List>
            {canCreate && <div className="connected-category-picker-create-row">
              <button
                type="button"
                className="connected-category-picker-item connected-category-picker-create"
                onClick={() => commit(trimmedQuery)}
              >
                {createLabel}
              </button>
            </div>}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  </div>
}

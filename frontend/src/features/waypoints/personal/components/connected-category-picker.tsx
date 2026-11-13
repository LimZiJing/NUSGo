import { useId, useState } from 'react'
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
  readonly placeholder?: string
}

/**
 * A text field for a category that also offers searchable suggestions and an explicit Create
 * result. The results panel extends from the field with no gap, sharing its surface and outer
 * outline, so it reads as one control rather than a floating list.
 *
 * This is the only category input in the app: the waypoint form and the Move-to-category workflow
 * both use it, so the two cannot drift apart.
 */
export function ConnectedCategoryPicker({
  label,
  value,
  options,
  onSelect,
  disabled = false,
  maxLength,
  placeholder,
}: ConnectedCategoryPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const inputId = useId()

  const trimmedQuery = query.trim()
  const createLabel = trimmedQuery ? `Create “${trimmedQuery}”` : ''
  const matches = filtering
    ? options.filter((option) => option.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()))
    : options
  const canCreate = filtering
    && trimmedQuery.length > 0
    && !options.some((option) => option.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase())

  const commit = (category: string): void => {
    onSelect(category)
    setQuery('')
    setFiltering(false)
    setOpen(false)
  }

  return <div className="connected-category-picker" data-open={open ? 'true' : 'false'}>
    <label className="connected-category-picker-label" htmlFor={inputId}>{label}</label>
    <Autocomplete.Root
      items={matches}
      value={query}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
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
          placeholder={placeholder ?? value}
          onFocus={() => setOpen(true)}
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
    <p className="connected-category-picker-current">
      <span className="visually-hidden">Current category: </span>{value}
    </p>
  </div>
}

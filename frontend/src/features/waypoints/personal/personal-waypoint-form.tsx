import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Form } from '@base-ui/react/form'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { PersonalWaypointDraft } from '../../../domain/waypoints/personal/create-personal-waypoint'
import type { PersonalWaypointCategoryOption } from '../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import {
  PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH,
  PERSONAL_WAYPOINT_NAME_MAX_LENGTH,
  PERSONAL_WAYPOINT_NOTE_MAX_LENGTH,
  type PersonalWaypoint,
  type PersonalWaypointValidationIssue,
} from '../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../ui/button'
import { AlertCircleIcon, ChevronDownIcon } from '../../../ui/icons'
import { PersonalWaypointAppearanceFields } from './components/personal-waypoint-appearance-fields'
import { PersonalWaypointSummary } from './components/personal-waypoint-summary'

function fieldError(issues: readonly PersonalWaypointValidationIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message
}

const validationSummary = 'Check the highlighted fields before saving.'

/**
 * Astryx `TextInput` exposes no max-length prop, so the native attribute is set on the rendered
 * input. This is the same approach PR #700 used for the community form's building search, and it
 * keeps the browser's own hard stop rather than relying on the form's validation to reject overflow.
 *
 * The element is found by its id rather than through a ref, because the name field's ref belongs to
 * the caller for initial focus; taking it over just to set this attribute would mean mutating a ref
 * this component was handed.
 */
function useInputMaxLength(id: string, maxLength?: number): void {
  useLayoutEffect(() => {
    const input = document.getElementById(id)
    if (input instanceof HTMLInputElement && maxLength !== undefined) input.maxLength = maxLength
  }, [id, maxLength])
}

/**
 * The category field.
 *
 * This is deliberately not Astryx `Typeahead`. That control types into a search box but its value is
 * an item from the list or `null` — it has no way to hold a category the person is inventing, and
 * inventing a new category is the main thing this field has to do. So it is built the way PR #700
 * built the community form's building search: an Astryx `TextInput` carrying the text the person
 * typed, dressed as a combobox, with a portalled listbox of suggestions underneath. Selecting a
 * suggestion replaces the text and closes the list; typing anything else just stays as the value.
 */
function CategoryField({
  value,
  error,
  suggestions,
  onChange,
}: {
  readonly value: string
  readonly error: string | undefined
  readonly suggestions: readonly string[]
  readonly onChange: (category: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Opening the list shows every saved category, even though the field already holds one. Filtering
  // only starts once the person types, otherwise opening the list would hide every category except
  // the one already chosen — exactly the ones they are opening it to change away from.
  const [isFiltering, setIsFiltering] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isChoosingRef = useRef(false)
  useInputMaxLength('personal-waypoint-category', PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + 1)
  const listboxId = 'personal-waypoint-category-listbox'
  const resultId = (index: number): string => `personal-waypoint-category-option-${index}`

  // The suggestion list is filtered by what has been typed, but an empty box offers everything so a
  // person can see which categories already exist before deciding to add one.
  const matches = useMemo(() => {
    const query = isFiltering ? value.trim().toLocaleLowerCase() : ''
    if (!query) return suggestions
    return suggestions.filter((category) => category.toLocaleLowerCase().includes(query))
  }, [suggestions, value, isFiltering])

  const measure = (): void => {
    const input = inputRef.current
    if (!input) return
    const box = input.getBoundingClientRect()
    // The popup is portalled to the body, so it is positioned against the viewport rather than a
    // scrolling ancestor; the input's own rect already accounts for any scroll.
    setPosition({ top: box.bottom + 4, left: box.left, width: box.width })
  }

  // The popup is only measured once it is about to show, so keep it aligned while the panel scrolls
  // or the window resizes with it open.
  useEffect(() => {
    if (!isOpen) return
    measure()
    const reposition = (): void => measure()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [isOpen])

  const close = (): void => {
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const choose = (category: string): void => {
    // Selecting a suggestion changes the value programmatically, which would otherwise be treated
    // as typing and reopen the list. The flag is cleared on the next frame, once that render and its
    // focus event have been and gone.
    isChoosingRef.current = true
    onChange(category)
    setIsFiltering(false)
    // Focus returns to the field so typing can continue, then the list is closed. Order matters:
    // focusing fires `onFocus`, which would otherwise leave the list open.
    inputRef.current?.focus()
    close()
    requestAnimationFrame(() => { isChoosingRef.current = false })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) => current <= 0 ? matches.length - 1 : current - 1)
    } else if (event.key === 'Enter' && isOpen && activeIndex >= 0 && matches[activeIndex]) {
      // Only a highlighted suggestion swallows Enter; otherwise the form submits, which is what the
      // person pressing Enter in a filled field expects.
      event.preventDefault()
      choose(matches[activeIndex])
    } else if (event.key === 'Escape' && isOpen) {
      // The list is the innermost thing on screen, so it owns this Escape. Without stopping the
      // event the application's capture-phase handler would step the whole panel back instead.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  return (
    <div className="personal-waypoint-field" data-invalid={error ? 'true' : undefined}>
      <TextInput
        ref={inputRef}
        id="personal-waypoint-category"
        label="Category"
        type="text"
        value={value}
        htmlName="category"
        placeholder=" "
        hasSpellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        status={error ? { type: 'error' } : undefined}
        containerClassName="personal-waypoint-astryx-field personal-waypoint-category-astryx-field"
        controlClassName="personal-waypoint-field-control personal-waypoint-category-input"
        aria-describedby={error ? 'personal-waypoint-category-error' : undefined}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && activeIndex >= 0 ? resultId(activeIndex) : undefined}
        onFocus={() => { if (!isChoosingRef.current) setIsOpen(true) }}
        // Choosing a suggestion closes the list from its own pointerdown, which cancels this blur,
        // so closing here only happens when focus genuinely leaves the field.
        onBlur={() => close()}
        onChange={(nextValue) => {
          onChange(nextValue)
          if (isChoosingRef.current) return
          setIsFiltering(true)
          setIsOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={handleKeyDown}
      />
      {suggestions.length > 0 && <Button
        type="button"
        className="personal-waypoint-category-trigger"
        ariaLabel="Show categories"
        expanded={isOpen}
        controls={listboxId}
        onClick={() => {
          // Opening from the button offers every category, not just those matching the field's text.
          setIsFiltering(false)
          measure()
          setIsOpen(true)
        }}
      >
        <ChevronDownIcon size={16} />
      </Button>}
      {error && <div id="personal-waypoint-category-error" className="personal-waypoint-field-error">
        <AlertCircleIcon className="personal-waypoint-field-error-icon" size={14} />
        <span>{error}</span>
      </div>}
      {isOpen && position && createPortal(<div
        id={listboxId}
        className="personal-waypoint-category-popup personal-waypoint-category-astryx-popup"
        role="listbox"
        aria-label="Category suggestions"
        style={{ top: position.top, left: position.left, width: position.width }}
      >
        {matches.length > 0 ? matches.map((category, index) => (
          <div
            key={category}
            id={resultId(index)}
            className="personal-waypoint-category-item"
            role="option"
            aria-selected={activeIndex === index}
            data-highlighted={activeIndex === index ? 'true' : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(category)}
          >
            {category}
          </div>
        )) : <div className="personal-waypoint-category-empty">
          {value.trim() ? 'No matching category. Keep typing to add it.' : 'No categories yet.'}
        </div>}
      </div>, document.body)}
    </div>
  )
}

export function PersonalWaypointForm({
  draft,
  issues,
  status,
  editConflict,
  onChange,
  initialFocusRef,
  onAdjustLocation,
  onCancel,
  onSave,
  submitLabel = 'Save waypoint',
  categoryOptions = [],
}: {
  readonly draft: PersonalWaypointDraft
  readonly issues: readonly PersonalWaypointValidationIssue[]
  readonly status: string | null
  readonly editConflict?: { readonly latestWaypoint: PersonalWaypoint | null } | null
  readonly onChange: (changes: Partial<PersonalWaypointDraft>) => void
  readonly initialFocusRef?: Ref<HTMLInputElement>
  readonly onAdjustLocation: () => void
  readonly onCancel: () => void
  readonly onSave: () => void
  readonly submitLabel?: string
  readonly categoryOptions?: readonly PersonalWaypointCategoryOption[]
}) {
  const submit = (event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); onSave() }
  useInputMaxLength('personal-waypoint-name', PERSONAL_WAYPOINT_NAME_MAX_LENGTH + 1)
  const nameError = fieldError(issues, 'name')
  const categoryError = fieldError(issues, 'category')
  const noteError = fieldError(issues, 'note')
  const conflictWaypoint = editConflict?.latestWaypoint ?? null
  const submitDisabled = Boolean(editConflict && !conflictWaypoint)
  const effectiveSubmitLabel = editConflict
    ? conflictWaypoint ? 'Replace saved version' : 'Saved waypoint removed'
    : submitLabel
  const formErrors: Record<string, string> = {}
  if (nameError) formErrors.name = nameError
  if (categoryError) formErrors.category = categoryError
  if (noteError) formErrors.note = noteError
  const categorySuggestions = useMemo(() => [...new Set([
    ...categoryOptions.map(({ category }) => category),
    draft.category.trim(),
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right)), [categoryOptions, draft.category])

  return <Form className="personal-waypoint-form" errors={formErrors} onSubmit={submit} noValidate>
    <div className="personal-waypoint-field" data-invalid={nameError ? 'true' : undefined}>
      <TextInput
        id="personal-waypoint-name"
        label="Name"
        type="text"
        value={draft.name}
        htmlName="name"
        placeholder=" "
        ref={initialFocusRef}
        status={nameError ? { type: 'error' } : undefined}
        // Astryx names the control from its own <label for>, so the floating treatment is applied
        // to that label in CSS and no second label is rendered here.
        containerClassName="personal-waypoint-astryx-field personal-waypoint-name-astryx-field"
        controlClassName="personal-waypoint-field-control"
        aria-describedby={nameError ? 'personal-waypoint-name-error' : undefined}
        autoComplete="off"
        onChange={(nextValue) => onChange({ name: nextValue })}
      />
      {nameError && <div id="personal-waypoint-name-error" className="personal-waypoint-field-error">
        <AlertCircleIcon className="personal-waypoint-field-error-icon" size={14} />
        <span>{nameError}</span>
      </div>}
    </div>
    <CategoryField
      value={draft.category}
      error={categoryError}
      suggestions={categorySuggestions}
      onChange={(category) => onChange({ category })}
    />
    <div className="personal-waypoint-field" data-invalid={noteError ? 'true' : undefined}>
      <TextArea
        id="personal-waypoint-note"
        label="Note (optional)"
        value={draft.note ?? ''}
        htmlName="note"
        placeholder=" "
        rows={2}
        htmlMaxLength={PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + 1}
        status={noteError ? { type: 'error' } : undefined}
        containerClassName="personal-waypoint-astryx-field personal-waypoint-note-astryx-field"
        controlClassName="personal-waypoint-field-control personal-waypoint-field-control--multiline"
        aria-describedby={noteError ? 'personal-waypoint-note-error' : undefined}
        onChange={(nextValue) => onChange({ note: nextValue })}
      />
      {noteError && <div id="personal-waypoint-note-error" className="personal-waypoint-field-error">
        <AlertCircleIcon className="personal-waypoint-field-error-icon" size={14} />
        <span>{noteError}</span>
      </div>}
    </div>
    <div
      className="personal-waypoint-location"
      role="group"
      aria-labelledby="personal-waypoint-location-label"
    >
      <strong id="personal-waypoint-location-label">Location</strong>
      <div className="personal-waypoint-location-content">
        <dl className="personal-waypoint-location-coordinate">
          <div>
            <dt>Latitude</dt>
            <dd>{draft.coordinate.latitude.toFixed(6)}°</dd>
          </div>
          <div>
            <dt>Longitude</dt>
            <dd>{draft.coordinate.longitude.toFixed(6)}°</dd>
          </div>
        </dl>
        <Button label="Adjust on map" onClick={onAdjustLocation} />
      </div>
    </div>
    <PersonalWaypointAppearanceFields draft={draft} onChange={onChange} />
    {editConflict && <section
      className="personal-waypoint-edit-conflict"
      role="alert"
      aria-labelledby="personal-waypoint-conflict-heading"
    >
      <h3 id="personal-waypoint-conflict-heading">Latest saved version</h3>
      {conflictWaypoint ? <>
        <p>Your draft is preserved. Review these saved values before replacing them.</p>
        <PersonalWaypointSummary waypoint={conflictWaypoint} showName />
        <p>Choose “Replace saved version” only if you want this draft to overwrite the latest values.</p>
      </> : <p>This waypoint was removed in another tab. Your draft is still here, but it cannot replace a deleted waypoint.</p>}
    </section>}
    <p className="personal-waypoint-save-note">Saved in this browser.</p>
    {status && status !== validationSummary && <p className="personal-waypoint-error">{status}</p>}
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <Button
        type="submit"
        variant="primary"
        disabled={submitDisabled}
        label={effectiveSubmitLabel}
      />
    </div>
  </Form>
}

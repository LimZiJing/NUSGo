import { useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
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

function PersonalWaypointField({
  id,
  name,
  label,
  error,
  children,
}: {
  readonly id: string
  readonly name: 'name' | 'note'
  readonly label: ReactNode
  readonly error: string | undefined
  readonly children: ReactNode
}) {
  return <Field.Root className="personal-waypoint-field" name={name} invalid={Boolean(error)}>
    <Field.Label className="personal-waypoint-field-label" htmlFor={id}>{label}</Field.Label>
    {children}
    {error && <Field.Error
      id={`${id}-error`}
      className="personal-waypoint-field-error"
      match={Boolean(error)}
    >
      <AlertCircleIcon className="personal-waypoint-field-error-icon" size={14} />
      <span>{error}</span>
    </Field.Error>}
  </Field.Root>
}

const validationSummary = 'Check the highlighted fields before saving.'

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
  const [isFilteringCategories, setIsFilteringCategories] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); onSave() }
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
  const categorySuggestions = [...new Set([
    ...categoryOptions.map(({ category }) => category),
    ...(!isFilteringCategories ? [draft.category.trim()] : []),
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right))

  return <Form className="personal-waypoint-form" errors={formErrors} onSubmit={submit} noValidate>
    <PersonalWaypointField id="personal-waypoint-name" name="name" label="Name" error={nameError}>
      <input
        id="personal-waypoint-name"
        className="personal-waypoint-field-control"
        ref={initialFocusRef}
        value={draft.name}
        placeholder=" "
        maxLength={PERSONAL_WAYPOINT_NAME_MAX_LENGTH + 1}
        aria-invalid={Boolean(nameError)}
        aria-describedby={nameError ? 'personal-waypoint-name-error' : undefined}
        onChange={(event) => onChange({ name: event.target.value })}
      />
    </PersonalWaypointField>
    <div className="personal-waypoint-field" data-invalid={categoryError ? 'true' : undefined}>
      <label className="personal-waypoint-field-label" htmlFor="personal-waypoint-category">Category</label>
      <Autocomplete.Root
        items={categorySuggestions}
        value={draft.category}
        onValueChange={(category, eventDetails) => {
          onChange({ category })
          setIsFilteringCategories(eventDetails.reason === 'input-change')
        }}
        onOpenChange={(open, eventDetails) => {
          if (open && categorySuggestions.length === 0) eventDetails.cancel()
        }}
        openOnInputClick
        filter={(category, query) => {
          const normalizedQuery = query.trim().toLocaleLowerCase()
          return !isFilteringCategories
            || !normalizedQuery
            || category.toLocaleLowerCase().includes(normalizedQuery)
        }}
      >
        <Autocomplete.InputGroup className="personal-waypoint-category-input-group">
          <Autocomplete.Input
            id="personal-waypoint-category"
            className="personal-waypoint-category-input personal-waypoint-field-control"
            placeholder=" "
            maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + 1}
            aria-invalid={Boolean(categoryError)}
            aria-describedby={categoryError ? 'personal-waypoint-category-error' : undefined}
          />
          {categorySuggestions.length > 0 && <Autocomplete.Trigger
            className="personal-waypoint-category-trigger"
            aria-label="Show categories"
          >
            <ChevronDownIcon size={16} />
          </Autocomplete.Trigger>}
        </Autocomplete.InputGroup>
        <Autocomplete.Portal>
          <Autocomplete.Positioner className="personal-waypoint-category-positioner" sideOffset={4}>
            <Autocomplete.Popup className="personal-waypoint-category-popup">
              <Autocomplete.Empty>
                <div className="personal-waypoint-category-empty">No matches</div>
              </Autocomplete.Empty>
              <Autocomplete.List className="personal-waypoint-category-list">
                {(category: string) => <Autocomplete.Item
                  key={category}
                  value={category}
                  className="personal-waypoint-category-item"
                >
                  {category}
                </Autocomplete.Item>}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
      {categoryError && <div id="personal-waypoint-category-error" className="personal-waypoint-field-error">
        <AlertCircleIcon className="personal-waypoint-field-error-icon" size={14} />
        <span>{categoryError}</span>
      </div>}
    </div>
    <PersonalWaypointField
      id="personal-waypoint-note"
      name="note"
      label={<>Note <span>(optional)</span></>}
      error={noteError}
    >
      <textarea
        id="personal-waypoint-note"
        className="personal-waypoint-field-control personal-waypoint-field-control--multiline"
        value={draft.note ?? ''}
        placeholder=" "
        rows={2}
        maxLength={PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + 1}
        aria-invalid={Boolean(noteError)}
        aria-describedby={noteError ? 'personal-waypoint-note-error' : undefined}
        onChange={(event) => onChange({ note: event.target.value })}
      />
    </PersonalWaypointField>
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

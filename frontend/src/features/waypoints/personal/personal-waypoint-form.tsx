import { type FormEvent, type Ref, useId } from 'react'
import type { PersonalWaypointDraft } from '../../../domain/waypoints/personal/create-personal-waypoint'
import type { PersonalWaypointCategoryOption } from '../../../domain/waypoints/personal/personal-waypoint-category-visibility'
import {
  PERSONAL_WAYPOINT_NAME_MAX_LENGTH,
  PERSONAL_WAYPOINT_NOTE_MAX_LENGTH,
  type PersonalWaypoint,
  type PersonalWaypointValidationIssue,
} from '../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../ui/button'
import { ConnectedCategoryPicker } from './connected-category-picker'
import { PersonalWaypointAppearanceFields } from './components/personal-waypoint-appearance-fields'
import { PersonalWaypointSummary } from './components/personal-waypoint-summary'

function fieldError(issues: readonly PersonalWaypointValidationIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message
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
  const formId = useId()
  const nameId = `${formId}-name`
  const categoryId = `${formId}-category`
  const noteId = `${formId}-note`
  const nameError = fieldError(issues, 'name')
  const categoryError = fieldError(issues, 'category')
  const noteError = fieldError(issues, 'note')
  const conflictWaypoint = editConflict?.latestWaypoint ?? null
  const submitDisabled = Boolean(editConflict && !conflictWaypoint)
  const effectiveSubmitLabel = editConflict
    ? conflictWaypoint ? 'Replace saved version' : 'Saved waypoint removed'
    : submitLabel
  const categorySuggestions = [...new Set(categoryOptions.map(({ category }) => category))].sort((left, right) => left.localeCompare(right))

  return <form className="personal-waypoint-form" onSubmit={submit} noValidate>
    <section className="personal-waypoint-form-fields" aria-label="Waypoint details">
    <label htmlFor={nameId}>Name</label>
    <input id={nameId} ref={initialFocusRef} value={draft.name} maxLength={PERSONAL_WAYPOINT_NAME_MAX_LENGTH + 1}
      aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${nameId}-error` : undefined}
      onChange={(event) => onChange({ name: event.target.value })} />
    {nameError && <p id={`${nameId}-error`} className="personal-waypoint-error">{nameError}</p>}
    <label htmlFor={categoryId}>Category</label>
    <ConnectedCategoryPicker id={categoryId} category={draft.category} options={categorySuggestions}
      onSelect={(category) => onChange({ category })} invalid={Boolean(categoryError)}
      describedBy={categoryError ? `${categoryId}-error` : undefined} />
    {categoryError && <p id={`${categoryId}-error`} className="personal-waypoint-error">{categoryError}</p>}
    <label htmlFor={noteId}>Note <span>(optional)</span></label>
    <textarea id={noteId} value={draft.note ?? ''} rows={3}
      maxLength={PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + 1}
      aria-invalid={Boolean(noteError)} aria-describedby={noteError ? `${noteId}-error` : undefined}
      onChange={(event) => onChange({ note: event.target.value })} />
    {noteError && <p id={`${noteId}-error`} className="personal-waypoint-error">{noteError}</p>}
    </section>
    <details className="personal-waypoint-location-disclosure"><summary><span>Location</span><span className="personal-waypoint-location-coordinate">{draft.coordinate.latitude.toFixed(6)}, {draft.coordinate.longitude.toFixed(6)}</span></summary><div className="personal-waypoint-location">
      <Button label="Adjust on map" onClick={onAdjustLocation} />
    </div></details>
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
    <p className="personal-waypoint-save-note">Saved in this browser profile.</p>
    {status && <p className="personal-waypoint-error" role="alert">{status}</p>}
    <div className="personal-waypoint-actions">
      <Button label="Cancel" onClick={onCancel} />
      <button
        type="submit"
        className="button"
        data-variant="primary"
        data-size="sm"
        disabled={submitDisabled}
      >
        <span>{effectiveSubmitLabel}</span>
      </button>
    </div>
  </form>
}

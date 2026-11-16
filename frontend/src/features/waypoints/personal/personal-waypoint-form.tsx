import type { FormEvent, Ref } from 'react'
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
import { PersonalWaypointAppearanceFields } from './components/personal-waypoint-appearance-fields'
import { ConnectedCategoryPicker } from './components/connected-category-picker'
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
  onSave,
  submitLabel = 'Save',
  categoryOptions = [],
}: {
  readonly draft: PersonalWaypointDraft
  readonly issues: readonly PersonalWaypointValidationIssue[]
  readonly status: string | null
  readonly editConflict?: { readonly latestWaypoint: PersonalWaypoint | null } | null
  readonly onChange: (changes: Partial<PersonalWaypointDraft>) => void
  readonly initialFocusRef?: Ref<HTMLInputElement>
  readonly onAdjustLocation: () => void
  readonly onSave: () => void
  readonly submitLabel?: string
  readonly categoryOptions?: readonly PersonalWaypointCategoryOption[]
}) {
  const submit = (event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); onSave() }
  const nameError = fieldError(issues, 'name')
  const categoryError = fieldError(issues, 'category')
  const noteError = fieldError(issues, 'note')
  const conflictWaypoint = editConflict?.latestWaypoint ?? null
  const submitDisabled = Boolean(editConflict && !conflictWaypoint)
  const effectiveSubmitLabel = editConflict
    ? conflictWaypoint ? 'Replace saved version' : 'Saved waypoint removed'
    : submitLabel
  const categorySuggestions = [...new Set(categoryOptions.map(({ category }) => category))]

  return <form className="personal-waypoint-form" onSubmit={submit} noValidate>
    {/* Three sections with the same structure — heading row, then content — so the form reads as
        one piece rather than a set of differently-shaped blocks. */}
    <section className="personal-waypoint-section" aria-labelledby="personal-waypoint-details-heading">
      <h2 id="personal-waypoint-details-heading" className="personal-waypoint-section-heading">Details</h2>
      <div className="personal-waypoint-fields">
        <div className="personal-waypoint-field">
          <label htmlFor="personal-waypoint-name">Name</label>
          <input id="personal-waypoint-name" ref={initialFocusRef} value={draft.name} maxLength={PERSONAL_WAYPOINT_NAME_MAX_LENGTH + 1}
            aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'personal-waypoint-name-error' : undefined}
            onChange={(event) => onChange({ name: event.target.value })} />
          {nameError && <p id="personal-waypoint-name-error" className="personal-waypoint-error">{nameError}</p>}
        </div>

        <div className="personal-waypoint-field">
          <ConnectedCategoryPicker
            label="Category"
            value={draft.category}
            options={categorySuggestions}
            maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + 1}
            onSelect={(category) => onChange({ category })}
          />
          {categoryError && <p id="personal-waypoint-category-error" className="personal-waypoint-error">{categoryError}</p>}
        </div>

        <div className="personal-waypoint-field">
          <label htmlFor="personal-waypoint-note">Note <span>(optional)</span></label>
          <textarea id="personal-waypoint-note" value={draft.note ?? ''} rows={3}
            maxLength={PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + 1}
            aria-invalid={Boolean(noteError)} aria-describedby={noteError ? 'personal-waypoint-note-error' : undefined}
            onChange={(event) => onChange({ note: event.target.value })} />
          {noteError && <p id="personal-waypoint-note-error" className="personal-waypoint-error">{noteError}</p>}
        </div>
      </div>
    </section>

    <section className="personal-waypoint-section" aria-labelledby="personal-waypoint-location-heading">
      <div className="personal-waypoint-section-heading-row">
        <h2 id="personal-waypoint-location-heading" className="personal-waypoint-section-heading">Location</h2>
        <Button label="Adjust on map" variant="ghost" onClick={onAdjustLocation} />
      </div>
      <p className="personal-waypoint-location-value">
        {draft.coordinate.latitude.toFixed(6)}, {draft.coordinate.longitude.toFixed(6)}
      </p>
    </section>

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

    {status && <p className="personal-waypoint-error" role="alert">{status}</p>}

    <div className="personal-waypoint-actions">
      <p className="personal-waypoint-save-note">This waypoint will be saved in this browser.</p>
      {/* No Cancel button: the panel's own Back leaves the form, and offering a second way out
          beside Save reads as a competing choice rather than a dismissal. */}
      {/* A submit button inside the form: the form's onSubmit is the single save path. Giving it an
          onClick as well would call save once per handler and save the waypoint twice. */}
      <Button
        label={effectiveSubmitLabel}
        variant="primary"
        type="submit"
        disabled={submitDisabled}
      />
    </div>
  </form>
}

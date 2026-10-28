import type { FormEvent, Ref } from 'react'
import type { PersonalWaypointDraft } from '../../../domain/waypoints/personal/create-personal-waypoint'
import {
  PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH,
  PERSONAL_WAYPOINT_NAME_MAX_LENGTH,
  PERSONAL_WAYPOINT_NOTE_MAX_LENGTH,
  type PersonalWaypoint,
  type PersonalWaypointValidationIssue,
} from '../../../domain/waypoints/personal/personal-waypoint'
import { Button } from '../../../ui/button'
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

  return <form className="personal-waypoint-form" onSubmit={submit} noValidate>
    <label htmlFor="personal-waypoint-name">Name</label>
    <input id="personal-waypoint-name" ref={initialFocusRef} value={draft.name} maxLength={PERSONAL_WAYPOINT_NAME_MAX_LENGTH + 1}
      aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'personal-waypoint-name-error' : undefined}
      onChange={(event) => onChange({ name: event.target.value })} />
    {nameError && <p id="personal-waypoint-name-error" className="personal-waypoint-error">{nameError}</p>}
    <label htmlFor="personal-waypoint-category">Category</label>
    <input id="personal-waypoint-category" value={draft.category} maxLength={PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH + 1}
      aria-invalid={Boolean(categoryError)} aria-describedby={categoryError ? 'personal-waypoint-category-error' : undefined}
      onChange={(event) => onChange({ category: event.target.value })} />
    {categoryError && <p id="personal-waypoint-category-error" className="personal-waypoint-error">{categoryError}</p>}
    <label htmlFor="personal-waypoint-note">Note <span>(optional)</span></label>
    <textarea id="personal-waypoint-note" value={draft.note ?? ''} rows={3}
      maxLength={PERSONAL_WAYPOINT_NOTE_MAX_LENGTH + 1}
      aria-invalid={Boolean(noteError)} aria-describedby={noteError ? 'personal-waypoint-note-error' : undefined}
      onChange={(event) => onChange({ note: event.target.value })} />
    {noteError && <p id="personal-waypoint-note-error" className="personal-waypoint-error">{noteError}</p>}
    <div className="personal-waypoint-location"><strong>Location</strong>
      <span>{draft.coordinate.latitude.toFixed(6)}, {draft.coordinate.longitude.toFixed(6)}</span>
      <Button label="Adjust on map" onClick={onAdjustLocation} />
    </div>
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

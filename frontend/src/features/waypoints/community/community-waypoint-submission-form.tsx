import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import {
  COMMUNITY_WAYPOINT_CATEGORIES,
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  SINGAPORE_COORDINATE_BOUNDS,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypoint,
  type CommunityWaypointSubmission,
  type ProposedCommunityWaypointFields,
} from '@nusgo/shared'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { CommunityWaypointSubmissionError } from '../../../domain/waypoints/community-waypoint-submission'
import { Button } from '../../../ui/button'
import './community-waypoint-submission-form.css'

interface SubmissionFields {
  readonly name: string
  readonly category: string
  readonly building: string
  readonly floor: string
  readonly details: string
  readonly accessibilityNote: string
  readonly explanation: string
  readonly requestedChange: string
}

type SubmissionField = keyof SubmissionFields | 'coordinate'
type SubmissionErrors = Partial<Record<SubmissionField, string>>
type FormStatus = 'editing' | 'submitting' | 'received'

function initialFields(waypoint: CommunityWaypoint | null): SubmissionFields {
  return {
    name: waypoint?.name ?? '',
    category: waypoint?.category ?? '',
    building: waypoint?.building ?? '',
    floor: waypoint?.floor === undefined ? '' : String(waypoint.floor),
    details: waypoint?.details ?? '',
    accessibilityNote: waypoint?.accessibilityNote ?? '',
    explanation: '',
    requestedChange: '',
  }
}

function coordinateLabel(coordinate: WaypointCoordinate): string {
  const latitude = `${Math.abs(coordinate.latitude).toFixed(6)}° ${coordinate.latitude < 0 ? 'S' : 'N'}`
  const longitude = `${Math.abs(coordinate.longitude).toFixed(6)}° ${coordinate.longitude < 0 ? 'W' : 'E'}`
  return `${latitude} · ${longitude}`
}

function validateFields(
  fields: SubmissionFields,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
): SubmissionErrors {
  const errors: SubmissionErrors = {}
  if (!waypoint && !fields.name.trim()) errors.name = 'Enter a place name.'
  if (!waypoint && !fields.category) errors.category = 'Choose a location type.'
  if (textExceedsLimit(fields.name, COMMUNITY_WAYPOINT_TEXT_LIMITS.name)) errors.name = 'Keep the name within 80 characters.'
  if (textExceedsLimit(fields.building, COMMUNITY_WAYPOINT_TEXT_LIMITS.building)) errors.building = 'Keep the building within 80 characters.'
  if (textExceedsLimit(fields.details, COMMUNITY_WAYPOINT_TEXT_LIMITS.details)) errors.details = 'Keep the details within 500 characters.'
  if (textExceedsLimit(fields.accessibilityNote, COMMUNITY_WAYPOINT_TEXT_LIMITS.accessibilityNote)) {
    errors.accessibilityNote = 'Keep the accessibility details within 280 characters.'
  }
  if (textExceedsLimit(fields.explanation, 1_000)) errors.explanation = 'Keep the note within 1,000 characters.'
  if (textExceedsLimit(fields.requestedChange, 1_000)) errors.requestedChange = 'Keep the reason within 1,000 characters.'
  if (waypoint && !fields.requestedChange.trim()) errors.requestedChange = 'Explain what needs correcting.'
  if (fields.floor.trim() && !Number.isSafeInteger(Number(fields.floor))) errors.floor = 'Enter a whole-number floor.'

  const { south, north, west, east } = SINGAPORE_COORDINATE_BOUNDS
  if (
    !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) ||
    coordinate.latitude < south || coordinate.latitude > north ||
    coordinate.longitude < west || coordinate.longitude > east
  ) errors.coordinate = 'Choose a location within Singapore.'

  return errors
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined
}

function textExceedsLimit(value: string, limit: number): boolean {
  return [...value.trim()].length > limit
}

function createSubmission(
  fields: SubmissionFields,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
): CommunityWaypointSubmission {
  const proposedFields: ProposedCommunityWaypointFields = {
    ...(optionalText(fields.name) ? { name: fields.name.trim() } : {}),
    ...(fields.category ? { category: fields.category as ActiveCommunityWaypointCategory } : {}),
    ...(optionalText(fields.building) ? { building: fields.building.trim() } : {}),
    ...(fields.floor.trim() ? { floor: Number(fields.floor) } : {}),
    ...(optionalText(fields.accessibilityNote) ? { accessibilityNote: fields.accessibilityNote.trim() } : {}),
    ...(optionalText(fields.details) ? { details: fields.details.trim() } : {}),
  }

  if (waypoint) {
    return {
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: fields.requestedChange.trim(),
      ...proposedFields,
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
    }
  }

  return {
    kind: 'new-place',
    ...proposedFields,
    name: fields.name.trim(),
    category: fields.category as ActiveCommunityWaypointCategory,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    ...(optionalText(fields.explanation) ? { explanation: fields.explanation.trim() } : {}),
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof CommunityWaypointSubmissionError)) {
    return 'Could not send the suggestion. Try again later.'
  }
  if (error.kind === 'invalid') return 'The suggestion could not be accepted. Check the fields and try again.'
  if (error.kind === 'rate-limited') return 'Too many suggestions were sent. Please try again later.'
  if (error.kind === 'network') return 'Could not send the suggestion. Check your connection and try again.'
  return 'Submissions are temporarily unavailable. Please try again later.'
}

export function CommunityWaypointSubmissionForm({
  waypoint,
  coordinate,
  onAdjustLocation,
  onSubmit,
  onBack,
  onPendingChange,
}: {
  readonly waypoint: CommunityWaypoint | null
  readonly coordinate: WaypointCoordinate
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
  readonly onSubmit: (submission: CommunityWaypointSubmission, signal: AbortSignal) => Promise<void>
  readonly onBack: () => void
  readonly onPendingChange?: (pending: boolean) => void
}) {
  const [fields, setFields] = useState(() => initialFields(waypoint))
  const [status, setStatus] = useState<FormStatus>('editing')
  const [errors, setErrors] = useState<SubmissionErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null)
  const submissionControllerRef = useRef<AbortController | null>(null)
  const isCorrection = waypoint !== null
  const fieldErrorMessage = Object.values(errors).filter(Boolean).join(' ')
  const errorMessageText = [fieldErrorMessage, submissionError].filter(Boolean).join(' ')

  useEffect(() => () => {
    submissionControllerRef.current?.abort()
  }, [])

  useLayoutEffect(() => {
    if (status === 'received') receiptHeadingRef.current?.focus()
  }, [status])

  const updateField = (field: keyof SubmissionFields, value: string): void => {
    setFields((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setSubmissionError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (status === 'submitting') return
    const validationErrors = validateFields(fields, waypoint, coordinate)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      const firstInvalidField = Object.keys(validationErrors)[0]
      const target = firstInvalidField === 'coordinate'
        ? formRef.current?.querySelector<HTMLElement>('.community-waypoint-submission-coordinate button')
        : formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)
      target?.focus()
      return
    }

    const controller = new AbortController()
    submissionControllerRef.current = controller
    setSubmissionError(null)
    setStatus('submitting')
    onPendingChange?.(true)
    try {
      await onSubmit(createSubmission(fields, waypoint, coordinate), controller.signal)
      if (!controller.signal.aborted) setStatus('received')
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setSubmissionError(errorMessage(error))
        setStatus('editing')
      }
    } finally {
      if (submissionControllerRef.current === controller) submissionControllerRef.current = null
      onPendingChange?.(false)
    }
  }

  return (
    <div className="community-waypoint-submission">
      <p className="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">{errorMessageText}</p>
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {status === 'received'
          ? 'Suggestion received. A maintainer will review it before publication. Because this form does not collect contact details, we cannot reply personally.'
          : status === 'submitting' ? 'Sending suggestion.' : ''}
      </p>
      {status === 'received' ? (
        <section className="community-waypoint-submission-receipt" aria-labelledby="community-waypoint-receipt-heading">
          <h3 id="community-waypoint-receipt-heading" ref={receiptHeadingRef} tabIndex={-1}>Suggestion received</h3>
          <p>
            A maintainer will review it before publication. Because this form does not collect contact details, we cannot reply personally.
          </p>
          <Button label="Done" variant="primary" onClick={onBack} />
        </section>
      ) : <form ref={formRef} className="community-waypoint-submission-form" onSubmit={(event) => { void submit(event) }} noValidate>
      <p className="community-waypoint-submission-guidance">
        Reviewed before publishing. No photos, photo links, or personal details.
      </p>
      {isCorrection && <p className="community-waypoint-submission-target">
        Correction for <strong>{waypoint.name}</strong> ({waypoint.id})
      </p>}

      <label htmlFor="community-submission-name">Place name{isCorrection ? ' (optional)' : ''}</label>
      <input
        id="community-submission-name"
        name="name"
        value={fields.name}
        maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.name + 1) * 2}
        aria-invalid={Boolean(errors.name)}
        onChange={(event) => updateField('name', event.target.value)}
      />

      <label htmlFor="community-submission-category">Location type{isCorrection ? ' (optional)' : ''}</label>
      <select
        id="community-submission-category"
        name="category"
        value={fields.category}
        aria-invalid={Boolean(errors.category)}
        onChange={(event) => updateField('category', event.target.value)}
      >
        <option value="">{isCorrection ? 'No change proposed' : 'Choose a location type'}</option>
        {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <div className="community-waypoint-submission-coordinate">
        <div>
          <strong>Selected location</strong>
          <span>{coordinateLabel(coordinate)}</span>
        </div>
        <Button label="Adjust on map" variant="ghost" onClick={(event) => onAdjustLocation(event.currentTarget)} />
      </div>

      <label htmlFor="community-submission-building">Building or landmark (optional)</label>
      <input
        id="community-submission-building"
        name="building"
        value={fields.building}
        maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.building + 1) * 2}
        aria-invalid={Boolean(errors.building)}
        onChange={(event) => updateField('building', event.target.value)}
      />

      <label htmlFor="community-submission-floor">Floor (optional)</label>
      <input
        id="community-submission-floor"
        name="floor"
        inputMode="numeric"
        value={fields.floor}
        aria-invalid={Boolean(errors.floor)}
        onChange={(event) => updateField('floor', event.target.value)}
      />

      <label htmlFor="community-submission-details">Details (optional)</label>
      <textarea
        id="community-submission-details"
        name="details"
        value={fields.details}
        maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.details + 1) * 2}
        aria-invalid={Boolean(errors.details)}
        onChange={(event) => updateField('details', event.target.value)}
      />

      <label htmlFor="community-submission-accessibility">Accessibility note (optional)</label>
      <textarea
        id="community-submission-accessibility"
        name="accessibilityNote"
        value={fields.accessibilityNote}
        maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.accessibilityNote + 1) * 2}
        aria-invalid={Boolean(errors.accessibilityNote)}
        onChange={(event) => updateField('accessibilityNote', event.target.value)}
      />

      {isCorrection ? (
        <>
          <label htmlFor="community-submission-correction">Correction reason</label>
          <textarea
            id="community-submission-correction"
            name="requestedChange"
            value={fields.requestedChange}
            maxLength={2_002}
            aria-invalid={Boolean(errors.requestedChange)}
            onChange={(event) => updateField('requestedChange', event.target.value)}
          />
        </>
      ) : (
        <>
          <label htmlFor="community-submission-explanation">Note for maintainers (optional)</label>
          <textarea
            id="community-submission-explanation"
            name="explanation"
            value={fields.explanation}
            maxLength={2_002}
            aria-invalid={Boolean(errors.explanation)}
            onChange={(event) => updateField('explanation', event.target.value)}
          />
        </>
      )}

      {errorMessageText && <p className="community-waypoint-submission-error" aria-hidden="true">{errorMessageText}</p>}
      <div className="community-waypoint-submission-actions">
        <Button label="Cancel" variant="ghost" onClick={onBack} disabled={status === 'submitting'} />
        <Button label={status === 'submitting' ? 'Sending…' : 'Send suggestion'} variant="primary" type="submit" busy={status === 'submitting'} />
      </div>
      </form>}
    </div>
  )
}

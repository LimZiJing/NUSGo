import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Field } from '@base-ui/react/field'
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
import { AlertCircleIcon } from '../../../ui/icons'
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

const ADDITIONAL_DETAIL_FIELDS = new Set<keyof SubmissionFields>([
  'building',
  'floor',
  'details',
  'accessibilityNote',
  'explanation',
])

function SubmissionField({
  id,
  name,
  label,
  optional = false,
  error,
  layout,
  children,
}: {
  readonly id: string
  readonly name: keyof SubmissionFields
  readonly label: string
  readonly optional?: boolean
  readonly error: string | undefined
  readonly layout?: 'select' | 'multiline'
  readonly children: ReactNode
}) {
  const className = ['community-waypoint-field', layout && `community-waypoint-field--${layout}`]
    .filter(Boolean)
    .join(' ')
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label className="community-waypoint-field-label" htmlFor={id}>
        {label}{optional && <span> (optional)</span>}
      </Field.Label>
      {children}
      {error && <Field.Error
        id={`${id}-error`}
        className="community-waypoint-field-error"
        match={Boolean(error)}
      >
        <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
        <span>{error}</span>
      </Field.Error>}
    </Field.Root>
  )
}

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

function coordinateValue(value: number, positiveDirection: string, negativeDirection: string): string {
  return `${Math.abs(value).toFixed(6)}° ${value < 0 ? negativeDirection : positiveDirection}`
}

function validateFields(
  fields: SubmissionFields,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
): SubmissionErrors {
  const errors: SubmissionErrors = {}
  if (!waypoint && !fields.name.trim()) errors.name = 'Enter a place name.'
  if (!waypoint && !fields.category) errors.category = 'Choose a category.'
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

function errorMessage(error: unknown, isCorrection: boolean): string {
  const report = isCorrection ? 'correction' : 'suggestion'
  if (!(error instanceof CommunityWaypointSubmissionError)) {
    return `Could not send the ${report}. Try again later.`
  }
  if (error.kind === 'invalid') return `The ${report} could not be accepted. Check the fields and try again.`
  if (error.kind === 'rate-limited') return 'Too many reports were sent. Please try again later.'
  if (error.kind === 'network') return `Could not send the ${report}. Check your connection and try again.`
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
  const [isAdditionalDetailsOpen, setIsAdditionalDetailsOpen] = useState(() => waypoint !== null)
  const formRef = useRef<HTMLFormElement>(null)
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null)
  const submissionControllerRef = useRef<AbortController | null>(null)
  const focusAfterDisclosureOpenRef = useRef<keyof SubmissionFields | null>(null)
  const isCorrection = waypoint !== null
  const receiptHeading = isCorrection ? 'Correction received' : 'Suggestion received'
  const fieldErrorMessage = Object.values(errors).filter(Boolean).join(' ')
  const errorMessageText = [fieldErrorMessage, submissionError].filter(Boolean).join(' ')

  useEffect(() => () => {
    submissionControllerRef.current?.abort()
  }, [])

  useLayoutEffect(() => {
    if (status === 'received') receiptHeadingRef.current?.focus()
  }, [status])

  useLayoutEffect(() => {
    if (!isAdditionalDetailsOpen || !focusAfterDisclosureOpenRef.current) return
    const field = focusAfterDisclosureOpenRef.current
    focusAfterDisclosureOpenRef.current = null
    formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()
  }, [isAdditionalDetailsOpen])

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
      const firstInvalidField = Object.keys(validationErrors)[0] as SubmissionField
      if (
        firstInvalidField !== 'coordinate' &&
        ADDITIONAL_DETAIL_FIELDS.has(firstInvalidField) &&
        !isAdditionalDetailsOpen
      ) {
        focusAfterDisclosureOpenRef.current = firstInvalidField
        setIsAdditionalDetailsOpen(true)
        return
      }
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
        setSubmissionError(errorMessage(error, isCorrection))
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
          ? `${receiptHeading}. A maintainer will review it before publication. This anonymous form cannot send a personal reply.`
          : status === 'submitting' ? 'Sending suggestion.' : ''}
      </p>
      {status === 'received' ? (
        <section className="community-waypoint-submission-receipt" aria-labelledby="community-waypoint-receipt-heading">
          <h3 id="community-waypoint-receipt-heading" ref={receiptHeadingRef} tabIndex={-1}>{receiptHeading}</h3>
          <p>
            A maintainer will review it before publishing. This anonymous form cannot send a personal reply.
          </p>
          <Button label="Done" variant="primary" onClick={onBack} />
        </section>
      ) : <form ref={formRef} className="community-waypoint-submission-form" onSubmit={(event) => { void submit(event) }} noValidate>
      <p className="community-waypoint-submission-guidance">
        Reviewed before publishing. No photos, photo links or personal details.
      </p>
      {isCorrection && <p className="community-waypoint-submission-target">
        <span>Correction for</span>
        <strong>{waypoint.name}</strong>
      </p>}

      <SubmissionField
        id="community-submission-name"
        name="name"
        label="Place name"
        optional={isCorrection}
        error={errors.name}
      >
        <input
          id="community-submission-name"
          name="name"
          className="community-waypoint-field-control"
          placeholder=" "
          value={fields.name}
          required={!isCorrection}
          maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.name + 1) * 2}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'community-submission-name-error' : undefined}
          onChange={(event) => updateField('name', event.target.value)}
        />
      </SubmissionField>

      <SubmissionField
        id="community-submission-category"
        name="category"
        label="Category"
        optional={isCorrection}
        error={errors.category}
        layout="select"
      >
        <select
          id="community-submission-category"
          name="category"
          className="community-waypoint-field-control"
          value={fields.category}
          required={!isCorrection}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? 'community-submission-category-error' : undefined}
          onChange={(event) => updateField('category', event.target.value)}
        >
          <option value="">{isCorrection ? 'No change proposed' : 'Choose a type'}</option>
          {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </SubmissionField>

      <div
        className="community-waypoint-submission-coordinate"
        role="group"
        aria-labelledby="community-submission-coordinate-label"
      >
        <strong id="community-submission-coordinate-label">Location</strong>
        <div className="community-waypoint-submission-coordinate-content">
          <dl className="community-waypoint-submission-coordinate-values">
            <div>
              <dt>Latitude</dt>
              <dd>{coordinateValue(coordinate.latitude, 'N', 'S')}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{coordinateValue(coordinate.longitude, 'E', 'W')}</dd>
            </div>
          </dl>
          <Button
            label="Adjust on map"
            onClick={(event) => onAdjustLocation(event.currentTarget)}
            ariaDescribedBy={errors.coordinate ? 'community-submission-coordinate-error' : undefined}
          />
        </div>
        {errors.coordinate && <p id="community-submission-coordinate-error" className="community-waypoint-field-error">
          <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
          <span>{errors.coordinate}</span>
        </p>}
      </div>

      {isCorrection && <SubmissionField
        id="community-submission-correction"
        name="requestedChange"
        label="What needs correcting?"
        error={errors.requestedChange}
        layout="multiline"
      >
        <textarea
          id="community-submission-correction"
          name="requestedChange"
          className="community-waypoint-field-control community-waypoint-field-control--multiline"
          placeholder=" "
          rows={2}
          value={fields.requestedChange}
          required
          maxLength={2_002}
          aria-invalid={Boolean(errors.requestedChange)}
          aria-describedby={errors.requestedChange ? 'community-submission-correction-error' : undefined}
          onChange={(event) => updateField('requestedChange', event.target.value)}
        />
      </SubmissionField>}

      <details
        className="community-waypoint-extra-fields"
        open={isAdditionalDetailsOpen}
        onToggle={(event) => setIsAdditionalDetailsOpen(event.currentTarget.open)}
      >
        <summary>Additional details <span>(optional)</span></summary>
        <div className="community-waypoint-extra-fields-content">
          <SubmissionField
            id="community-submission-building"
            name="building"
            label="Building or landmark"
            optional
            error={errors.building}
          >
            <input
              id="community-submission-building"
              name="building"
              className="community-waypoint-field-control"
              placeholder=" "
              value={fields.building}
              maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.building + 1) * 2}
              aria-invalid={Boolean(errors.building)}
              aria-describedby={errors.building ? 'community-submission-building-error' : undefined}
              onChange={(event) => updateField('building', event.target.value)}
            />
          </SubmissionField>
          <SubmissionField
            id="community-submission-floor"
            name="floor"
            label="Floor"
            optional
            error={errors.floor}
          >
            <input
              id="community-submission-floor"
              name="floor"
              className="community-waypoint-field-control"
              placeholder=" "
              inputMode="numeric"
              value={fields.floor}
              aria-invalid={Boolean(errors.floor)}
              aria-describedby={errors.floor ? 'community-submission-floor-error' : undefined}
              onChange={(event) => updateField('floor', event.target.value)}
            />
          </SubmissionField>
          <SubmissionField
            id="community-submission-details"
            name="details"
            label="Details"
            optional
            error={errors.details}
            layout="multiline"
          >
            <textarea
              id="community-submission-details"
              name="details"
              className="community-waypoint-field-control community-waypoint-field-control--multiline"
              placeholder=" "
              rows={2}
              value={fields.details}
              maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.details + 1) * 2}
              aria-invalid={Boolean(errors.details)}
              aria-describedby={errors.details ? 'community-submission-details-error' : undefined}
              onChange={(event) => updateField('details', event.target.value)}
            />
          </SubmissionField>
          <SubmissionField
            id="community-submission-accessibility"
            name="accessibilityNote"
            label="Accessibility note"
            optional
            error={errors.accessibilityNote}
            layout="multiline"
          >
            <textarea
              id="community-submission-accessibility"
              name="accessibilityNote"
              className="community-waypoint-field-control community-waypoint-field-control--multiline"
              placeholder=" "
              rows={2}
              value={fields.accessibilityNote}
              maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.accessibilityNote + 1) * 2}
              aria-invalid={Boolean(errors.accessibilityNote)}
              aria-describedby={errors.accessibilityNote ? 'community-submission-accessibility-error' : undefined}
              onChange={(event) => updateField('accessibilityNote', event.target.value)}
            />
          </SubmissionField>
          {!isCorrection && <SubmissionField
            id="community-submission-explanation"
            name="explanation"
            label="Note for maintainers"
            optional
            error={errors.explanation}
            layout="multiline"
          >
            <textarea
              id="community-submission-explanation"
              name="explanation"
              className="community-waypoint-field-control community-waypoint-field-control--multiline"
              placeholder=" "
              rows={2}
              value={fields.explanation}
              maxLength={2_002}
              aria-invalid={Boolean(errors.explanation)}
              aria-describedby={errors.explanation ? 'community-submission-explanation-error' : undefined}
              onChange={(event) => updateField('explanation', event.target.value)}
            />
          </SubmissionField>}
        </div>
      </details>

      {submissionError && <p className="community-waypoint-submission-error" aria-hidden="true">{submissionError}</p>}
      <div className="community-waypoint-submission-actions">
        <Button label="Cancel" variant="ghost" onClick={onBack} disabled={status === 'submitting'} />
        <Button
          label={status === 'submitting' ? 'Sending…' : 'Send suggestion'}
          variant="primary"
          type="submit"
          busy={status === 'submitting'}
        />
      </div>
      </form>}
    </div>
  )
}

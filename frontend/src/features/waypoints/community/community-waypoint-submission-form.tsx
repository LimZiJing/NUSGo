import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
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
import { getDistanceMeters } from '../../../domain/location/coordinates'
import {
  describeBuildingEntry,
  searchBuildings,
  type BuildingIndex,
} from '../../../domain/venue/building-index'
import { CommunityWaypointSubmissionError } from '../../../domain/waypoints/community-waypoint-submission'
import { Button } from '../../../ui/button'
import {
  AlertCircleIcon,
  BanknoteIcon,
  BuildingIcon,
  CupSodaIcon,
  DropletsIcon,
  SearchIcon,
  ToiletIcon,
} from '../../../ui/icons'
import './community-waypoint-submission-form.css'

interface SubmissionFields {
  readonly category: string
  readonly building: string
  readonly floor: string
  readonly explanation: string
  readonly requestedChange: string
}

type SubmissionField = keyof SubmissionFields | 'coordinate'
type SubmissionErrors = Partial<Record<SubmissionField, string>>
type FormStatus = 'editing' | 'submitting' | 'received'
type LocationStatus = 'locating' | 'ready' | 'required'

const CATEGORY_ICONS = {
  water_cooler: DropletsIcon,
  atm: BanknoteIcon,
  toilet: ToiletIcon,
  vending_machine: CupSodaIcon,
} satisfies Record<ActiveCommunityWaypointCategory, typeof DropletsIcon>

function SubmissionField({
  id,
  name,
  label,
  error,
  layout,
  children,
}: {
  readonly id: string
  readonly name: keyof SubmissionFields
  readonly label: string
  readonly error: string | undefined
  readonly layout?: 'select' | 'multiline' | 'search'
  readonly children: ReactNode
}) {
  const className = ['community-waypoint-field', layout && `community-waypoint-field--${layout}`]
    .filter(Boolean)
    .join(' ')
  return (
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
      <Field.Label className="community-waypoint-field-label" htmlFor={id}>
        {label}
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
    category: waypoint?.category ?? '',
    building: waypoint?.building ?? '',
    floor: waypoint?.floor === undefined ? '' : String(waypoint.floor),
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
  locationReady: boolean,
): SubmissionErrors {
  const errors: SubmissionErrors = {}
  if (!waypoint && !fields.category) errors.category = 'Choose a category.'
  if (textExceedsLimit(fields.building, COMMUNITY_WAYPOINT_TEXT_LIMITS.building)) errors.building = 'Keep the building within 80 characters.'
  if (textExceedsLimit(fields.explanation, 1_000)) errors.explanation = 'Keep the note within 1,000 characters.'
  if (textExceedsLimit(fields.requestedChange, 1_000)) errors.requestedChange = 'Keep the reason within 1,000 characters.'
  if (waypoint && !fields.requestedChange.trim()) errors.requestedChange = 'Explain what needs correcting.'
  if (fields.floor.trim() && !Number.isSafeInteger(Number(fields.floor))) errors.floor = 'Enter a whole-number floor.'
  if (!locationReady) errors.coordinate = 'Set the waypoint location before sending.'

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
  const optionalFields: Omit<ProposedCommunityWaypointFields, 'category' | 'longitude' | 'latitude'> = {
    ...(optionalText(fields.building) ? { building: fields.building.trim() } : {}),
    ...(fields.floor.trim() ? { floor: Number(fields.floor) } : {}),
  }

  if (waypoint) {
    return {
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: fields.requestedChange.trim(),
      ...(fields.category ? { category: fields.category as ActiveCommunityWaypointCategory } : {}),
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
      ...optionalFields,
    }
  }

  return {
    kind: 'new-place',
    category: fields.category as ActiveCommunityWaypointCategory,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    ...optionalFields,
    ...(optionalText(fields.explanation) ? { explanation: fields.explanation.trim() } : {}),
  }
}

function getNearestBuildingName(buildings: BuildingIndex | null, coordinate: WaypointCoordinate): string | null {
  if (!buildings) return null
  let nearest: { readonly name: string; readonly distance: number } | null = null

  for (const building of buildings.entries) {
    const distance = getDistanceMeters(coordinate, {
      longitude: building.location.x,
      latitude: building.location.y,
    })
    if (nearest === null || distance < nearest.distance) nearest = { name: building.name, distance }
  }

  return nearest?.name ?? null
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
  locationStatus,
  locationAccuracy,
  buildingIndex,
  onAdjustLocation,
  onSubmit,
  onBack,
  onPendingChange,
}: {
  readonly waypoint: CommunityWaypoint | null
  readonly coordinate: WaypointCoordinate
  readonly locationStatus: LocationStatus
  readonly locationAccuracy: number | null
  readonly buildingIndex: BuildingIndex | null
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
  readonly onSubmit: (submission: CommunityWaypointSubmission, signal: AbortSignal) => Promise<void>
  readonly onBack: () => void
  readonly onPendingChange?: (pending: boolean) => void
}) {
  const [fields, setFields] = useState(() => initialFields(waypoint))
  const [status, setStatus] = useState<FormStatus>('editing')
  const [errors, setErrors] = useState<SubmissionErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [previousLocationStatus, setPreviousLocationStatus] = useState(locationStatus)
  const [locationAnnouncement, setLocationAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null)
  const submissionControllerRef = useRef<AbortController | null>(null)
  const isCorrection = waypoint !== null
  const nearestBuildingName = !isCorrection && locationStatus === 'ready'
    ? getNearestBuildingName(buildingIndex, coordinate)
    : null
  const buildingSearchResults = useMemo(
    () => buildingIndex && fields.building.trim()
      ? searchBuildings(buildingIndex, fields.building)
      : [],
    [buildingIndex, fields.building],
  )
  const receiptHeading = isCorrection ? 'Correction received' : 'Suggestion received'
  const fieldErrorMessage = Object.values(errors).filter(Boolean).join(' ')
  const errorMessageText = [fieldErrorMessage, submissionError].filter(Boolean).join(' ')

  if (locationStatus !== previousLocationStatus) {
    setPreviousLocationStatus(locationStatus)
    setLocationAnnouncement(locationStatus === 'ready'
      ? 'Waypoint location set. Check the pin before sending.'
      : locationStatus === 'required'
        ? 'Current location unavailable. Set the waypoint on the map before sending.'
        : 'Getting your current location.')
  }

  useEffect(() => () => {
    submissionControllerRef.current?.abort()
  }, [])

  const autoFilledBuildingRef = useRef<string | null>(null)
  useEffect(() => {
    const previousAutoFill = autoFilledBuildingRef.current
    const nextBuilding = nearestBuildingName ?? ''
    autoFilledBuildingRef.current = nearestBuildingName
    setFields((current) => {
      const canUpdateBuilding = !current.building.trim() || current.building === previousAutoFill
      if (!canUpdateBuilding || current.building === nextBuilding) return current
      return { ...current, building: nextBuilding }
    })
  }, [nearestBuildingName])

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
    const validationErrors = validateFields(fields, waypoint, coordinate, locationStatus === 'ready')
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      const firstInvalidField = Object.keys(validationErrors)[0] as SubmissionField
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
          : status === 'submitting' ? 'Sending suggestion.' : locationAnnouncement}
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
      {isCorrection && <p className="community-waypoint-submission-target">
        <span>Correction for</span>
        <strong>{waypoint.displayLabel}</strong>
      </p>}

      {isCorrection ? (
        <SubmissionField
          id="community-submission-category"
          name="category"
          label="Category"
          error={errors.category}
          layout="select"
        >
          <select
            id="community-submission-category"
            name="category"
            className="community-waypoint-field-control"
            value={fields.category}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? 'community-submission-category-error' : undefined}
            onChange={(event) => updateField('category', event.target.value)}
          >
            <option value="">No change proposed</option>
            {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </SubmissionField>
      ) : (
        <fieldset
          className="community-waypoint-category-picker"
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? 'community-submission-category-error' : undefined}
        >
          <legend>Choose a category</legend>
          <div className="community-waypoint-category-options">
            {COMMUNITY_WAYPOINT_CATEGORIES.map(({ value, label }) => {
              const Icon = CATEGORY_ICONS[value]
              return (
                <label key={value} className="community-waypoint-category-option">
                  <input
                    type="radio"
                    name="category"
                    value={value}
                    checked={fields.category === value}
                    required
                    onChange={(event) => updateField('category', event.target.value)}
                  />
                  <span className="community-waypoint-category-card">
                    <Icon size={23} />
                    <span>{label}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {errors.category && <p id="community-submission-category-error" className="community-waypoint-field-error">
            <AlertCircleIcon className="community-waypoint-field-error-icon" size={14} />
            <span>{errors.category}</span>
          </p>}
        </fieldset>
      )}

      <div
        className="community-waypoint-submission-coordinate"
        role="group"
        aria-labelledby="community-submission-coordinate-label"
      >
        <div className="community-waypoint-submission-coordinate-heading">
          <strong id="community-submission-coordinate-label">Location</strong>
          {locationStatus === 'ready' && locationAccuracy !== null && Number.isFinite(locationAccuracy) && (
            <span className="community-waypoint-location-status">Using current location</span>
          )}
        </div>
        <div className="community-waypoint-submission-coordinate-content">
          {locationStatus === 'ready' ? (
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
          ) : (
            <p className="community-waypoint-location-message">
              {locationStatus === 'locating'
                ? 'Getting your current location…'
                : 'Could not get your location. Set the waypoint location on the map before sending.'}
            </p>
          )}
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

      <section className="community-waypoint-extra-fields" aria-labelledby="community-submission-building-floor-heading">
        <h3 id="community-submission-building-floor-heading" className="community-waypoint-extra-fields-title">
          Building and floor <span>(optional)</span>
        </h3>
        <div className="community-waypoint-extra-fields-content">
          <SubmissionField
            id="community-submission-building"
            name="building"
            label="Building or landmark"
            error={errors.building}
            layout="search"
          >
            <Autocomplete.Root
              items={buildingIndex?.entries ?? []}
              filteredItems={buildingSearchResults}
              value={fields.building}
              itemToStringValue={(entry) => entry.name}
              openOnInputClick
              onValueChange={(value) => updateField('building', value)}
            >
              <Autocomplete.InputGroup className="community-waypoint-building-input-group">
                <SearchIcon className="community-waypoint-building-search-icon" />
                <Autocomplete.Input
                  id="community-submission-building"
                  name="building"
                  className="community-waypoint-field-control community-waypoint-building-input"
                  placeholder=" "
                  maxLength={(COMMUNITY_WAYPOINT_TEXT_LIMITS.building + 1) * 2}
                  aria-invalid={Boolean(errors.building)}
                  aria-describedby={errors.building ? 'community-submission-building-error' : undefined}
                  autoComplete="off"
                />
              </Autocomplete.InputGroup>
              <Autocomplete.Portal>
                <Autocomplete.Positioner className="community-waypoint-building-positioner" sideOffset={4}>
                  <Autocomplete.Popup className="community-waypoint-building-popup">
                    <Autocomplete.Empty>
                      <div className="community-waypoint-building-empty">
                        {fields.building.trim()
                          ? 'No matching buildings. You can keep your text.'
                          : 'Search for a building or landmark.'}
                      </div>
                    </Autocomplete.Empty>
                    <Autocomplete.List className="community-waypoint-building-list">
                      {(entry) => {
                        const secondary = describeBuildingEntry(entry)
                        return (
                          <Autocomplete.Item
                            key={entry.id}
                            value={entry}
                            className="community-waypoint-building-item"
                          >
                            <BuildingIcon className="community-waypoint-building-item-icon" />
                            <span className="community-waypoint-building-item-label">
                              <strong>{entry.name}</strong>
                              {secondary && <span>{secondary}</span>}
                            </span>
                          </Autocomplete.Item>
                        )
                      }}
                    </Autocomplete.List>
                  </Autocomplete.Popup>
                </Autocomplete.Positioner>
              </Autocomplete.Portal>
            </Autocomplete.Root>
          </SubmissionField>
          <SubmissionField
            id="community-submission-floor"
            name="floor"
            label="Floor"
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
        </div>
      </section>

      {!isCorrection && <SubmissionField
        id="community-submission-explanation"
        name="explanation"
        label="Note for reviewers"
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

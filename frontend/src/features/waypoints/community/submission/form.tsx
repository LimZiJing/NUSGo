import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  CommunityWaypoint,
  CommunityWaypointSubmission,
} from '@nusgo/shared'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { createBuildingFloorLookup } from '../../../../domain/venue/building-floors'
import { findNearestBuilding, type BuildingIndex } from '../../../../domain/venue/building-index'
import { Button } from '../../../../ui/button'
import {
  createSubmission,
  getSubmissionErrorMessage,
  initialSubmissionDraft,
  validateSubmissionDraft,
  type LocationStatus,
  type SubmissionDraft,
  type SubmissionErrors,
  type SubmissionField,
} from './draft'
import { CommunityWaypointSubmissionFields } from './fields'
import './form.css'

type FormStatus = 'editing' | 'submitting' | 'received'

export function CommunityWaypointSubmissionForm({
  waypoint,
  coordinate,
  locationStatus,
  locationAccuracy,
  buildingIndex,
  venues,
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
  readonly venues: VenueLocationMap | null
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
  readonly onSubmit: (submission: CommunityWaypointSubmission, signal: AbortSignal) => Promise<void>
  readonly onBack: () => void
  readonly onPendingChange?: (pending: boolean) => void
}) {
  const [draft, setDraft] = useState(() => initialSubmissionDraft(waypoint))
  const [status, setStatus] = useState<FormStatus>('editing')
  const [errors, setErrors] = useState<SubmissionErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [previousLocationStatus, setPreviousLocationStatus] = useState(locationStatus)
  const [locationAnnouncement, setLocationAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null)
  const submissionControllerRef = useRef<AbortController | null>(null)
  const autoFilledBuildingRef = useRef<string | null>(null)
  const isCorrection = waypoint !== null
  const nearestBuildingName = useMemo(() => {
    if (isCorrection || locationStatus !== 'ready') return null
    return findNearestBuilding(buildingIndex, coordinate)?.name ?? null
  }, [buildingIndex, coordinate, isCorrection, locationStatus])
  const buildingFloorLookup = useMemo(
    () => createBuildingFloorLookup(venues, buildingIndex),
    [buildingIndex, venues],
  )
  const observedFloors = buildingFloorLookup(draft.building)
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

  useEffect(() => {
    const previousAutoFill = autoFilledBuildingRef.current
    const nextBuilding = nearestBuildingName ?? ''
    autoFilledBuildingRef.current = nearestBuildingName
    setDraft((current) => {
      const canUpdateBuilding = !current.building.trim() || current.building === previousAutoFill
      if (!canUpdateBuilding || current.building === nextBuilding) return current
      return { ...current, building: nextBuilding }
    })
  }, [nearestBuildingName])

  useLayoutEffect(() => {
    if (status === 'received') receiptHeadingRef.current?.focus()
  }, [status])

  const updateField = (field: keyof SubmissionDraft, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const errorField = field === 'otherFloor' ? 'floor' : field
      if (!current[errorField]) return current
      const next = { ...current }
      delete next[errorField]
      return next
    })
    setSubmissionError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (status === 'submitting') return

    const validationErrors = validateSubmissionDraft(draft, waypoint, coordinate, locationStatus === 'ready')
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      focusFirstInvalidField(Object.keys(validationErrors)[0] as SubmissionField)
      return
    }

    const controller = new AbortController()
    submissionControllerRef.current = controller
    setSubmissionError(null)
    setStatus('submitting')
    onPendingChange?.(true)
    try {
      await onSubmit(createSubmission(draft, waypoint, coordinate), controller.signal)
      if (!controller.signal.aborted) setStatus('received')
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setSubmissionError(getSubmissionErrorMessage(error, isCorrection))
        setStatus('editing')
      }
    } finally {
      if (submissionControllerRef.current === controller) submissionControllerRef.current = null
      onPendingChange?.(false)
    }
  }

  const focusFirstInvalidField = (field: SubmissionField): void => {
    const target = field === 'coordinate'
      ? formRef.current?.querySelector<HTMLElement>('.community-waypoint-submission-coordinate button')
      : field === 'floor'
        ? formRef.current?.querySelector<HTMLElement>('#community-submission-other-floor')
          ?? formRef.current?.querySelector<HTMLElement>('#community-submission-floor [role="radio"][aria-checked="true"]')
        : formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)
    target?.focus()
  }

  return (
    <div className="community-waypoint-submission">
      <p className="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
        {errorMessageText}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {status === 'received'
          ? `${receiptHeading}. A maintainer will review it before publication. This anonymous form cannot send a personal reply.`
          : status === 'submitting' ? 'Sending suggestion.' : locationAnnouncement}
      </p>

      {status === 'received' ? (
        <section className="community-waypoint-submission-receipt" aria-labelledby="community-waypoint-receipt-heading">
          <h3 id="community-waypoint-receipt-heading" ref={receiptHeadingRef} tabIndex={-1}>{receiptHeading}</h3>
          <p>A maintainer will review it before publishing. This anonymous form cannot send a personal reply.</p>
          <Button label="Done" variant="primary" onClick={onBack} />
        </section>
      ) : (
        <form
          ref={formRef}
          className="community-waypoint-submission-form"
          onSubmit={(event) => { void submit(event) }}
          noValidate
        >
          <CommunityWaypointSubmissionFields
            draft={draft}
            errors={errors}
            waypoint={waypoint}
            coordinate={coordinate}
            locationStatus={locationStatus}
            locationAccuracy={locationAccuracy}
            buildingIndex={buildingIndex}
            observedFloors={observedFloors}
            onFieldChange={updateField}
            onAdjustLocation={onAdjustLocation}
          />

          {submissionError && <p className="community-waypoint-submission-error" aria-hidden="true">
            {submissionError}
          </p>}
          <div className="community-waypoint-submission-actions">
            <Button label="Cancel" variant="ghost" onClick={onBack} disabled={status === 'submitting'} />
            <Button
              label={status === 'submitting' ? 'Sending…' : 'Send suggestion'}
              variant="primary"
              type="submit"
              busy={status === 'submitting'}
            />
          </div>
        </form>
      )}
    </div>
  )
}

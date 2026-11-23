import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import type {
  CommunityWaypoint,
  CommunityWaypointSubmission,
} from '@nusgo/shared'
import type { VenueMap } from '@nusgo/shared/venue/types'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { createBuildingFloorLookup } from '../../../../domain/venue/building-floors'
import { findNearestBuilding, type BuildingIndex } from '../../../../domain/venue/building-index'
import { getIsMobileViewport } from '../../../../ui/mobile/mobile-viewport'
import {
  createSubmission,
  getSubmissionErrorMessage,
  initialSubmissionDraft,
  priceCentsToDraft,
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
  readonly venues: VenueMap | null
  readonly onAdjustLocation: (trigger: HTMLButtonElement) => void
  readonly onSubmit: (submission: CommunityWaypointSubmission, signal: AbortSignal) => Promise<void>
  readonly onBack: () => void
  readonly onPendingChange?: (pending: boolean) => void
}) {
  const [draft, setDraft] = useState(() => initialSubmissionDraft(waypoint))
  const [status, setStatus] = useState<FormStatus>('editing')
  const [errors, setErrors] = useState<SubmissionErrors>({})
  const [isDetailsOpen, setIsDetailsOpen] = useState(() => Boolean(waypoint && (
    (waypoint.services?.length ?? 0) > 0 || waypoint.colour !== undefined ||
    waypoint.grayscalePriceCentsPerPage !== undefined || waypoint.colourPriceCentsPerPage !== undefined ||
    (waypoint.items?.length ?? 0) > 0 || (waypoint.prep?.length ?? 0) > 0 || waypoint.bidet !== undefined
  )))
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [previousLocationStatus, setPreviousLocationStatus] = useState(locationStatus)
  const [locationAnnouncement, setLocationAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const pendingInvalidFieldRef = useRef<SubmissionField | null>(null)
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

  const revealFocusedControl = useCallback((): void => {
    const active = document.activeElement
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return
    const scrollContainer = formRef.current?.closest<HTMLElement>('.more-panel-content-scroll')
    const viewport = window.visualViewport
    if (!scrollContainer || !viewport) return

    const fieldRect = active.getBoundingClientRect()
    const panelRect = scrollContainer.getBoundingClientRect()
    const visibleTop = Math.max(panelRect.top, viewport.offsetTop + 12)
    const visibleBottom = Math.min(panelRect.bottom, viewport.offsetTop + viewport.height - 24)
    if (fieldRect.bottom > visibleBottom) {
      scrollContainer.scrollBy({ top: fieldRect.bottom - visibleBottom + 24, behavior: 'smooth' })
    } else if (fieldRect.top < visibleTop) {
      scrollContainer.scrollBy({ top: fieldRect.top - visibleTop - 16, behavior: 'smooth' })
    }
  }, [])

  const scheduleFocusedControlReveal = useCallback((): void => {
    window.requestAnimationFrame(revealFocusedControl)
    window.setTimeout(revealFocusedControl, 220)
  }, [revealFocusedControl])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    viewport.addEventListener('resize', revealFocusedControl)
    viewport.addEventListener('scroll', revealFocusedControl)
    return () => {
      viewport.removeEventListener('resize', revealFocusedControl)
      viewport.removeEventListener('scroll', revealFocusedControl)
    }
  }, [revealFocusedControl])

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

  const updateField = (
    field: keyof SubmissionDraft,
    value: SubmissionDraft[keyof SubmissionDraft],
  ): void => {
    setDraft((current) => {
      if (field === 'category' && typeof value === 'string' && current.category !== value) {
        const previousCategory = current.category || waypoint?.category
        const selectedCategory = value || waypoint?.category
        if (previousCategory === selectedCategory) return { ...current, category: value }
        const preserveExisting = waypoint?.category === selectedCategory
        return {
          ...current,
          category: value,
          services: preserveExisting ? waypoint?.services ?? [] : [],
          colour: preserveExisting && waypoint?.colour !== undefined
            ? waypoint.colour ? 'yes' : 'no'
            : '',
          bidet: preserveExisting && waypoint?.bidet !== undefined
            ? waypoint.bidet ? 'yes' : 'no'
            : '',
          grayscalePricePerPage: preserveExisting
            ? priceCentsToDraft(waypoint?.grayscalePriceCentsPerPage)
            : '',
          colourPricePerPage: preserveExisting
            ? priceCentsToDraft(waypoint?.colourPriceCentsPerPage)
            : '',
          items: preserveExisting ? waypoint?.items ?? [] : [],
          prep: preserveExisting ? waypoint?.prep ?? [] : [],
          detailsTouched: false,
        }
      }

      const isDetailsField = field === 'services' || field === 'colour' ||
        field === 'grayscalePricePerPage' || field === 'colourPricePerPage' ||
        field === 'items' || field === 'prep' || field === 'bidet'
      return {
        ...current,
        [field]: value,
        ...(isDetailsField ? { detailsTouched: true } : {}),
      } as SubmissionDraft
    })
    setErrors((current) => {
      const errorField = field === 'otherFloor' ? 'floor' : field
      if (field !== 'category' && !current[errorField]) return current
      const next = { ...current }
      delete next[errorField]
      if (field === 'category') {
        delete next.services
        delete next.colour
        delete next.grayscalePricePerPage
        delete next.colourPricePerPage
        delete next.items
        delete next.prep
        delete next.bidet
      }
      return next
    })
    setSubmissionError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (status === 'submitting') return

    const validationErrors = validateSubmissionDraft(draft, waypoint, coordinate, locationStatus === 'ready')
    if (Object.keys(validationErrors).length > 0) {
      if (
        validationErrors.services || validationErrors.colour || validationErrors.grayscalePricePerPage ||
        validationErrors.colourPricePerPage || validationErrors.items || validationErrors.prep || validationErrors.bidet
      ) setIsDetailsOpen(true)
      pendingInvalidFieldRef.current = Object.keys(validationErrors)[0] as SubmissionField
      setErrors(validationErrors)
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

  useEffect(() => {
    const field = pendingInvalidFieldRef.current
    pendingInvalidFieldRef.current = null
    if (field === null) return
    const target = field === 'coordinate'
      ? formRef.current?.querySelector<HTMLElement>('.community-waypoint-submission-coordinate button')
      : field === 'floor'
        ? formRef.current?.querySelector<HTMLElement>('#community-submission-other-floor')
          ?? formRef.current?.querySelector<HTMLElement>('#community-submission-floor input[name="floor"]:checked')
          ?? formRef.current?.querySelector<HTMLElement>('#community-submission-floor input[name="floor"]')
        : field === 'grayscalePricePerPage'
          ? formRef.current?.querySelector<HTMLElement>('#community-submission-grayscale-price')
          : field === 'colourPricePerPage'
            ? formRef.current?.querySelector<HTMLElement>('#community-submission-colour-price')
            : formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)
    if (!getIsMobileViewport() || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      target?.focus()
    }
  }, [errors])

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
          onFocusCapture={scheduleFocusedControlReveal}
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
            isDetailsOpen={isDetailsOpen}
            onDetailsOpenChange={setIsDetailsOpen}
            onFieldChange={updateField}
            onAdjustLocation={onAdjustLocation}
          />

          {submissionError && <p className="community-waypoint-submission-error" aria-hidden="true">
            {submissionError}
          </p>}
          <div className="community-waypoint-submission-actions">
            <Button className="community-waypoint-form-action" label="Cancel" variant="ghost" onClick={onBack} isDisabled={status === 'submitting'} />
            <Button
              label={status === 'submitting' ? 'Sending…' : 'Send suggestion'}
              className="community-waypoint-form-action"
              variant="primary"
              type="submit"
              isLoading={status === 'submitting'}
            />
          </div>
        </form>
      )}
    </div>
  )
}

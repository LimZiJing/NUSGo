import {
  COMMUNITY_WAYPOINT_TEXT_LIMITS,
  SINGAPORE_COORDINATE_BOUNDS,
  type ActiveCommunityWaypointCategory,
  type CommunityWaypoint,
  type CommunityWaypointDetailsSuggestion,
  type CommunityWaypointPrintingService,
  type CommunityWaypointVendingItem,
  type CommunityWaypointVendingPrep,
  type CommunityWaypointSubmission,
  type ProposedCommunityWaypointFields,
} from '@nusgo/shared'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import { CommunityWaypointSubmissionError } from '../../../../domain/waypoints/community-waypoint-submission'

export interface SubmissionDraft {
  readonly category: string
  readonly building: string
  readonly floor: string
  readonly otherFloor: string
  readonly explanation: string
  readonly requestedChange: string
  readonly services: readonly CommunityWaypointPrintingService[]
  readonly colour: '' | 'yes' | 'no'
  readonly grayscalePricePerPage: string
  readonly colourPricePerPage: string
  readonly items: readonly CommunityWaypointVendingItem[]
  readonly prep: readonly CommunityWaypointVendingPrep[]
  readonly detailsTouched: boolean
}

export type SubmissionField = keyof SubmissionDraft | 'coordinate'
export type SubmissionErrors = Partial<Record<SubmissionField, string>>
export type LocationStatus = 'locating' | 'ready' | 'required'

export const OTHER_FLOOR = 'other'
export const FLOOR_UNSET = 'unset'

export function initialSubmissionDraft(
  waypoint: CommunityWaypoint | null,
  initialCategory: ActiveCommunityWaypointCategory | null = null,
): SubmissionDraft {
  return {
    category: waypoint ? '' : initialCategory ?? '',
    building: waypoint?.building ?? '',
    floor: waypoint?.floor === undefined ? '' : String(waypoint.floor),
    otherFloor: '',
    explanation: '',
    requestedChange: '',
    services: waypoint?.services ?? [],
    colour: waypoint?.colour === undefined ? '' : waypoint.colour ? 'yes' : 'no',
    grayscalePricePerPage: priceCentsToDraft(waypoint?.grayscalePriceCentsPerPage),
    colourPricePerPage: priceCentsToDraft(waypoint?.colourPriceCentsPerPage),
    items: waypoint?.items ?? [],
    prep: waypoint?.prep ?? [],
    detailsTouched: false,
  }
}

export function validateSubmissionDraft(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
  locationReady: boolean,
): SubmissionErrors {
  const errors: SubmissionErrors = {}
  if (!waypoint && !draft.category) errors.category = 'Choose a category.'
  if (textExceedsLimit(draft.building, COMMUNITY_WAYPOINT_TEXT_LIMITS.building)) {
    errors.building = 'Keep the building within 80 characters.'
  }
  if (textExceedsLimit(draft.explanation, 1_000)) errors.explanation = 'Keep the note within 1,000 characters.'
  if (textExceedsLimit(draft.requestedChange, 1_000)) errors.requestedChange = 'Keep the reason within 1,000 characters.'
  if (waypoint && !draft.requestedChange.trim()) errors.requestedChange = 'Explain what needs correcting.'

  if (draft.detailsTouched && getDetailsCategory(draft, waypoint) === 'printing') {
    if (!isValidPriceDraft(draft.grayscalePricePerPage)) {
      errors.grayscalePricePerPage = 'Enter a price with up to 2 decimal places.'
    }
    if (!isValidPriceDraft(draft.colourPricePerPage)) {
      errors.colourPricePerPage = 'Enter a price with up to 2 decimal places.'
    }
    if (draft.colour !== 'yes' && draft.colourPricePerPage.trim()) {
      errors.colourPricePerPage = 'Add a colour price only when Colour is Yes.'
    }
  }

  const floorValue = getFloorInputValue(draft)
  if (
    (draft.floor === OTHER_FLOOR && !floorValue.trim()) ||
    (floorValue.trim() && !Number.isSafeInteger(Number(floorValue)))
  ) errors.floor = 'Enter a whole-number floor.'
  if (!locationReady) errors.coordinate = 'Set the waypoint location before sending.'

  const { south, north, west, east } = SINGAPORE_COORDINATE_BOUNDS
  if (
    !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) ||
    coordinate.latitude < south || coordinate.latitude > north ||
    coordinate.longitude < west || coordinate.longitude > east
  ) errors.coordinate = 'Choose a location within Singapore.'

  return errors
}

export function createSubmission(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
  coordinate: WaypointCoordinate,
): CommunityWaypointSubmission {
  const floorValue = getFloorInputValue(draft)
  const optionalFields: Omit<ProposedCommunityWaypointFields, 'category' | 'longitude' | 'latitude'> = {
    ...(optionalText(draft.building) ? { building: draft.building.trim() } : {}),
    ...(floorValue.trim() ? { floor: Number(floorValue) } : {}),
  }
  const suggestedDetails = createSuggestedDetails(draft, waypoint)

  if (waypoint) {
    return {
      kind: 'correction',
      waypointId: waypoint.id,
      requestedChange: draft.requestedChange.trim(),
      ...(draft.category ? { category: draft.category as ActiveCommunityWaypointCategory } : {}),
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
      ...optionalFields,
      ...(suggestedDetails === undefined ? {} : { suggestedDetails }),
    }
  }

  return {
    kind: 'new-place',
    category: draft.category as ActiveCommunityWaypointCategory,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    ...optionalFields,
    ...(suggestedDetails === undefined || !hasSubmittedDetails(suggestedDetails)
      ? {}
      : { suggestedDetails }),
    ...(optionalText(draft.explanation) ? { explanation: draft.explanation.trim() } : {}),
  }
}

export function getSubmissionErrorMessage(error: unknown, isCorrection: boolean): string {
  const report = isCorrection ? 'correction' : 'suggestion'
  if (!(error instanceof CommunityWaypointSubmissionError)) {
    return `Could not send the ${report}. Try again later.`
  }
  if (error.kind === 'invalid') return `The ${report} could not be accepted. Check the fields and try again.`
  if (error.kind === 'rate-limited') return 'Too many reports were sent. Please try again later.'
  if (error.kind === 'network') return `Could not send the ${report}. Check your connection and try again.`
  return 'Submissions are temporarily unavailable. Please try again later.'
}

function getFloorInputValue(draft: SubmissionDraft): string {
  return draft.floor === OTHER_FLOOR ? draft.otherFloor : draft.floor
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined
}

function textExceedsLimit(value: string, limit: number): boolean {
  return [...value.trim()].length > limit
}

export function priceCentsToDraft(value: number | undefined): string {
  return value === undefined ? '' : (value / 100).toFixed(2)
}

export function getDetailsCategory(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
): 'printing' | 'vending_machine' | undefined {
  const category = draft.category || waypoint?.category
  return category === 'printing' || category === 'vending_machine' ? category : undefined
}

export function priceDraftToCents(value: string): number | null {
  if (!value.trim()) return null
  const [whole = '', fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
}

export function isValidPriceDraft(value: string): boolean {
  if (!value.trim()) return true
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return false
  return Number.isSafeInteger(priceDraftToCents(value))
}

function createSuggestedDetails(
  draft: SubmissionDraft,
  waypoint: CommunityWaypoint | null,
): CommunityWaypointDetailsSuggestion | undefined {
  const category = getDetailsCategory(draft, waypoint)
  if (!draft.detailsTouched || category === undefined) return undefined

  if (category === 'printing') {
    return {
      category,
      services: draft.services,
      colour: draft.colour === 'yes' ? true : draft.colour === 'no' ? false : null,
      grayscalePriceCentsPerPage: priceDraftToCents(draft.grayscalePricePerPage),
      colourPriceCentsPerPage: draft.colour === 'yes' ? priceDraftToCents(draft.colourPricePerPage) : null,
    }
  }

  return { category, items: draft.items, prep: draft.prep }
}

function hasSubmittedDetails(details: CommunityWaypointDetailsSuggestion): boolean {
  if (details.category === 'printing') {
    return details.services.length > 0 || details.colour !== null ||
      details.grayscalePriceCentsPerPage !== null || details.colourPriceCentsPerPage !== null
  }
  return details.items.length > 0 || details.prep.length > 0
}

import { getTripEndpointKey } from '../../domain/trip/endpoints'
import type { Journey, JourneyLeg } from '../../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../../domain/trip/planner'
import type { TripEndpoint } from '../../domain/trip/types'

const MAX_DISPLAYED_JOURNEYS = 3
const WALKING_FIRST_RATIO = 0.8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isTripEndpoint(value: unknown): value is TripEndpoint {
  if (!isRecord(value)) return false
  if (value.kind === 'current-location') {
    if (!isRecord(value.coordinate)) return false
    const { longitude, latitude } = value.coordinate
    return typeof longitude === 'number' && Number.isFinite(longitude) &&
      longitude >= -180 && longitude <= 180 &&
      typeof latitude === 'number' && Number.isFinite(latitude) &&
      latitude >= -90 && latitude <= 90
  }
  return (value.kind === 'venue' || value.kind === 'stop') && isNonEmptyString(value.id)
}

function isValidLineString(value: unknown): boolean {
  if (!isRecord(value) || value.type !== 'LineString' || !Array.isArray(value.coordinates)) {
    return false
  }
  if (value.coordinates.length < 2) return false
  return value.coordinates.every((coordinate: unknown) => (
    Array.isArray(coordinate) && coordinate.length === 2 &&
    typeof coordinate[0] === 'number' && Number.isFinite(coordinate[0]) &&
    coordinate[0] >= -180 && coordinate[0] <= 180 &&
    typeof coordinate[1] === 'number' && Number.isFinite(coordinate[1]) &&
    coordinate[1] >= -90 && coordinate[1] <= 90
  ))
}

function isJourneyLeg(value: unknown): value is JourneyLeg {
  if (!isRecord(value) || !isTripEndpoint(value.from) || !isTripEndpoint(value.to) ||
    !isFiniteNonNegative(value.durationSeconds) || !isFiniteNonNegative(value.distanceMeters) ||
    !isValidLineString(value.geometry)) return false

  if (value.mode === 'walking') return true
  if (value.mode !== 'shuttle' || !isNonEmptyString(value.routeId) ||
    !isNonEmptyString(value.boardingStopId) || !isNonEmptyString(value.alightingStopId) ||
    !isFiniteNonNegative(value.waitingSeconds) || !isFiniteNonNegative(value.rideSeconds)) {
    return false
  }

  return value.from.kind === 'stop' && value.from.id === value.boardingStopId &&
    value.to.kind === 'stop' && value.to.id === value.alightingStopId &&
    value.durationSeconds === value.waitingSeconds + value.rideSeconds
}

function isValidJourney(value: unknown): value is Journey {
  if (!isRecord(value) || !isTripEndpoint(value.origin) || !isTripEndpoint(value.destination) ||
    !Array.isArray(value.legs) || value.legs.length === 0 ||
    value.estimateStatus !== 'estimated' ||
    (value.planningQuality !== 'exact' && value.planningQuality !== 'bounded') ||
    !isFiniteNonNegative(value.totalDurationSeconds) ||
    !isFiniteNonNegative(value.totalDistanceMeters) ||
    !value.legs.every(isJourneyLeg)) return false

  let expectedFrom = value.origin
  let totalDurationSeconds = 0
  let totalDistanceMeters = 0
  for (const leg of value.legs) {
    if (getTripEndpointKey(leg.from) !== getTripEndpointKey(expectedFrom)) return false
    expectedFrom = leg.to
    totalDurationSeconds += leg.durationSeconds
    totalDistanceMeters += leg.distanceMeters
  }

  return getTripEndpointKey(expectedFrom) === getTripEndpointKey(value.destination) &&
    value.totalDurationSeconds === totalDurationSeconds &&
    value.totalDistanceMeters === totalDistanceMeters
}

function almostEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8
}

function getAdjustedDurationSeconds(journey: Journey): number {
  let shuttleBoardings = 0
  let adjustedDurationSeconds = 0
  for (const leg of journey.legs) {
    if (leg.mode === 'walking') {
      adjustedDurationSeconds += leg.durationSeconds / 0.8
    } else {
      adjustedDurationSeconds += leg.durationSeconds / (shuttleBoardings > 0 ? 0.9 : 1)
      shuttleBoardings += 1
    }
  }
  return adjustedDurationSeconds
}

function isScoredJourneyCandidate(value: unknown): value is ScoredJourneyCandidate {
  if (!isRecord(value) || !isNonEmptyString(value.candidateKey) || !isValidJourney(value.journey) ||
    !isFiniteNonNegative(value.adjustedDurationSeconds) ||
    typeof value.score !== 'number' || Number.isNaN(value.score) || value.score < 0) return false

  const expectedDuration = getAdjustedDurationSeconds(value.journey)
  const expectedScore = expectedDuration === 0 ? Number.POSITIVE_INFINITY : 1 / expectedDuration
  return almostEqual(value.adjustedDurationSeconds, expectedDuration) && value.score === expectedScore
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function compareCandidates(
  first: ScoredJourneyCandidate,
  second: ScoredJourneyCandidate,
): number {
  const getBoardings = (journey: Journey): number => (
    journey.legs.filter((leg) => leg.mode === 'shuttle').length
  )
  const getWalkingDistance = (journey: Journey): number => (
    journey.legs.reduce((total, leg) => (
      total + (leg.mode === 'walking' ? leg.distanceMeters : 0)
    ), 0)
  )

  return first.adjustedDurationSeconds - second.adjustedDurationSeconds ||
    getBoardings(first.journey) - getBoardings(second.journey) ||
    getWalkingDistance(first.journey) - getWalkingDistance(second.journey) ||
    first.journey.legs.length - second.journey.legs.length ||
    compareText(first.candidateKey, second.candidateKey)
}

/**
 * Chooses the Plan candidates without changing #266's search or candidate scores.
 * The candidate pool must contain fully enriched Journeys; malformed entries fail closed.
 */
export function selectJourneysForDisplay(
  candidates: readonly ScoredJourneyCandidate[],
): readonly ScoredJourneyCandidate[] {
  const rankedCandidates = candidates
    .filter(isScoredJourneyCandidate)
    .sort(compareCandidates)
  const seenCandidateKeys = new Set<string>()
  const distinctCandidates = rankedCandidates.filter(({ candidateKey }) => {
    if (seenCandidateKeys.has(candidateKey)) return false
    seenCandidateKeys.add(candidateKey)
    return true
  })
  const busCandidates = distinctCandidates
    .filter(({ journey }) => journey.legs.some((leg) => leg.mode === 'shuttle'))
    .slice(0, MAX_DISPLAYED_JOURNEYS)
  const walkingCandidate = distinctCandidates.find(({ journey }) => (
    journey.legs.every((leg) => leg.mode === 'walking')
  ))

  if (busCandidates.length === 0) return walkingCandidate ? [walkingCandidate] : []

  if (
    walkingCandidate &&
    walkingCandidate.adjustedDurationSeconds < busCandidates[0]!.adjustedDurationSeconds * WALKING_FIRST_RATIO
  ) {
    return [walkingCandidate, ...busCandidates]
  }

  return [
    ...busCandidates,
    ...(walkingCandidate
      ? [walkingCandidate]
      : []),
  ]
}

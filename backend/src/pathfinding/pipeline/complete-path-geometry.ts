import { getTripEndpointKey } from '../endpoints.ts'
import type { Path, ScoredPathCandidate } from '../path.ts'
import {
  MAX_BUS_PATH_CANDIDATES,
  type PathCandidateSearchResult,
  type PathSearchStatus,
} from '../search/search-path-candidates.ts'
import type { WalkingRouteEngine } from '../walking/walking-contracts.ts'
import type { ResolvedPathLocation } from './resolve-path-endpoints.ts'

export interface CompletedPathGeometry {
  readonly candidates: readonly ScoredPathCandidate[]
  readonly searchStatus: PathSearchStatus
  readonly geometryCandidateChecks: number
  readonly geometryRouteRequests: number
  readonly geometryRouteCacheHits: number
}

function busRouteSequence(candidate: ScoredPathCandidate): string {
  return JSON.stringify(candidate.path.legs.filter((leg) => leg.mode === 'shuttle').map((leg) => leg.routeId))
}

function createAbortError(): Error {
  const error = new Error('The pathfinding request was aborted')
  error.name = 'AbortError'
  return error
}

export class PathGeometryDeadlineExceededError extends Error {
  constructor() {
    super('Path geometry completion exceeded its time budget')
    this.name = 'PathGeometryDeadlineExceededError'
  }
}

interface PreparedCandidateGeometry {
  readonly promise: Promise<Path['legs']>
  readonly state: {
    completedAtMs: number | null
    legs: Path['legs'] | null
  }
}

function isValidWalkingGeometry(geometry: Path['legs'][number]['geometry']): boolean {
  return geometry.type === 'LineString' &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(([longitude, latitude]) => (
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    ))
}

function createDeadlineSignal(signal: AbortSignal, deadlineAtMs: number, monotonicNow: () => number) {
  // Route requests must stop on either caller cancellation or the geometry-stage deadline.
  const controller = new AbortController()
  const deadlineError = new PathGeometryDeadlineExceededError()
  let expired = false
  const abortFromRequest = () => controller.abort(createAbortError())
  if (signal.aborted) abortFromRequest()
  else signal.addEventListener('abort', abortFromRequest, { once: true })
  const remainingMs = Math.max(0, deadlineAtMs - monotonicNow())
  const expire = () => {
    if (controller.signal.aborted) return
    expired = true
    controller.abort(deadlineError)
  }
  const timeout = setTimeout(expire, remainingMs)
  return {
    signal: controller.signal,
    expire,
    hasExpired: () => expired,
    deadlineError,
    dispose() {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortFromRequest)
      // Stop only this stage's speculative route work; caller cancellation stays separate.
      if (!controller.signal.aborted) controller.abort(createAbortError())
    },
  }
}

export async function completePathGeometry(
  routeEngine: WalkingRouteEngine,
  search: PathCandidateSearchResult,
  locations: readonly ResolvedPathLocation[],
  signal: AbortSignal,
  deadlineAtMs: number,
  monotonicNow: () => number,
): Promise<CompletedPathGeometry | null> {
  const locationByKey = new Map(locations.map((location) => [location.key, location]))
  const routePromises = new Map<string, Promise<Path['legs'][number]['geometry']>>()
  const deadline = createDeadlineSignal(signal, deadlineAtMs, monotonicNow)
  const candidates: ScoredPathCandidate[] = []
  let geometryCandidateChecks = 0
  let geometryRouteRequests = 0
  let geometryRouteCacheHits = 0
  let searchStatus = search.status
  let lastGeometryError: unknown = null

  const getRouteGeometry = (
    from: ResolvedPathLocation,
    to: ResolvedPathLocation,
  ): Promise<Path['legs'][number]['geometry']> => {
    if (signal.aborted) return Promise.reject(createAbortError())
    if (monotonicNow() >= deadlineAtMs) deadline.expire()
    if (deadline.signal.aborted) {
      return Promise.reject(deadline.signal.reason ?? deadline.deadlineError)
    }
    const key = `${from.key}\u0000${to.key}`
    const cached = routePromises.get(key)
    if (cached) {
      geometryRouteCacheHits += 1
      return cached
    }
    geometryRouteRequests += 1
    const promise = routeEngine.routeWalking(
      { origin: from.coordinate, destination: to.coordinate },
      deadline.signal,
    ).then(({ geometry }) => {
      if (!isValidWalkingGeometry(geometry)) throw new Error('Walking route returned incomplete geometry')
      return geometry
    })
    routePromises.set(key, promise)
    return promise
  }

  const preparedGeometry = new Map<ScoredPathCandidate, PreparedCandidateGeometry>()
  const prepareCandidateGeometry = (candidate: ScoredPathCandidate): Promise<Path['legs']> => (
    Promise.all(candidate.path.legs.map(async (leg) => {
      if (leg.mode === 'shuttle') return leg
      const from = locationByKey.get(getTripEndpointKey(leg.from))
      const to = locationByKey.get(getTripEndpointKey(leg.to))
      if (!from || !to) throw new Error('Walking path leg has an unknown endpoint')
      // Search placeholders carry no routed shape; only validated provider geometry reaches a Path.
      return { ...leg, geometry: await getRouteGeometry(from, to) }
    }))
  )
  const getPreparedGeometry = (candidate: ScoredPathCandidate): PreparedCandidateGeometry => {
    const existing = preparedGeometry.get(candidate)
    if (existing) return existing

    const state: PreparedCandidateGeometry['state'] = { completedAtMs: null, legs: null }
    const promise = prepareCandidateGeometry(candidate).then((legs) => {
      state.completedAtMs = monotonicNow()
      state.legs = legs
      return legs
    })
    const prepared = { promise, state }
    void promise.catch(() => undefined)
    preparedGeometry.set(candidate, prepared)
    return prepared
  }

  try {
    let preferredBusCount = 0
    let preferredWalkingFound = false
    const preferredBusRoutes = new Set<string>()
    for (const candidate of search.rankedCandidates) {
      const isBus = candidate.path.legs.some((leg) => leg.mode === 'shuttle')
      if (isBus) {
        if (preferredBusCount >= MAX_BUS_PATH_CANDIDATES) continue
        const key = busRouteSequence(candidate)
        if (preferredBusRoutes.has(key)) continue
        preferredBusRoutes.add(key)
        preferredBusCount += 1
      } else {
        if (preferredWalkingFound) continue
        preferredWalkingFound = true
      }
      getPreparedGeometry(candidate)
      if (preferredBusCount >= MAX_BUS_PATH_CANDIDATES && preferredWalkingFound) break
    }

    let busCandidateCount = 0
    let walkingCandidateFound = false
    const completedBusRoutes = new Set<string>()
    const appendCandidate = (candidate: ScoredPathCandidate, legs: Path['legs']): boolean => {
      if (legs.some((leg) => leg.mode === 'walking' && !isValidWalkingGeometry(leg.geometry))) return false
      const key = busRouteSequence(candidate)
      if (key !== '[]' && completedBusRoutes.has(key)) return false
      if (key !== '[]') completedBusRoutes.add(key)
      candidates.push({ ...candidate, path: { ...candidate.path, legs } })
      if (candidate.path.legs.some((leg) => leg.mode === 'shuttle')) busCandidateCount += 1
      else walkingCandidateFound = true
      return true
    }
    const harvestCompletedCandidates = (startIndex: number): void => {
      for (let index = startIndex; index < search.rankedCandidates.length; index += 1) {
        const candidate = search.rankedCandidates[index]!
        const isBus = candidate.path.legs.some((leg) => leg.mode === 'shuttle')
        if (
          (isBus && (busCandidateCount >= MAX_BUS_PATH_CANDIDATES || completedBusRoutes.has(busRouteSequence(candidate)))) ||
          (!isBus && walkingCandidateFound)
        ) continue
        const prepared = preparedGeometry.get(candidate)
        const completedAtMs = prepared?.state.completedAtMs
        const legs = prepared?.state.legs
        if (
          completedAtMs === null || completedAtMs === undefined || completedAtMs >= deadlineAtMs ||
          !legs
        ) continue
        geometryCandidateChecks += 1
        appendCandidate(candidate, legs)
      }
    }

    for (let candidateIndex = 0; candidateIndex < search.rankedCandidates.length; candidateIndex += 1) {
      const candidate = search.rankedCandidates[candidateIndex]!
      if (signal.aborted) throw createAbortError()
      if (monotonicNow() >= deadlineAtMs) {
        deadline.expire()
        searchStatus = 'budget-exceeded'
        harvestCompletedCandidates(candidateIndex)
        break
      }

      const isBus = candidate.path.legs.some((leg) => leg.mode === 'shuttle')
      if (
        (isBus && (busCandidateCount >= MAX_BUS_PATH_CANDIDATES || completedBusRoutes.has(busRouteSequence(candidate)))) ||
        (!isBus && walkingCandidateFound)
      ) continue
      geometryCandidateChecks += 1
      let valid = true
      const prepared = getPreparedGeometry(candidate)
      try {
        const legs = await prepared.promise
        if (signal.aborted) throw createAbortError()
        const completedAtMs = prepared.state.completedAtMs
        if (completedAtMs === null || completedAtMs >= deadlineAtMs) {
          deadline.expire()
          searchStatus = 'budget-exceeded'
          harvestCompletedCandidates(candidateIndex + 1)
          break
        }
        if (deadline.hasExpired() || monotonicNow() >= deadlineAtMs) {
          deadline.expire()
          searchStatus = 'budget-exceeded'
          valid = appendCandidate(candidate, legs)
          harvestCompletedCandidates(candidateIndex + 1)
          break
        }
        valid = appendCandidate(candidate, legs)
      } catch (error: unknown) {
        if (signal.aborted) throw createAbortError()
        if (deadline.hasExpired() || monotonicNow() >= deadlineAtMs) {
          deadline.expire()
          searchStatus = 'budget-exceeded'
          harvestCompletedCandidates(candidateIndex + 1)
          break
        }
        valid = false
        lastGeometryError = error
      }
      if (!valid && deadline.hasExpired()) {
        searchStatus = 'budget-exceeded'
        break
      }
      if (busCandidateCount >= MAX_BUS_PATH_CANDIDATES && walkingCandidateFound) break
    }
  } finally {
    deadline.dispose()
  }

  if (signal.aborted) throw createAbortError()
  if (candidates.length === 0 && search.rankedCandidates.length > 0 && deadline.hasExpired()) {
    throw deadline.deadlineError
  }
  if (candidates.length === 0 && search.rankedCandidates.length > 0 && lastGeometryError) {
    throw lastGeometryError
  }

  // An incomplete option is skipped so the next ranked candidate can fill its display quota.
  return candidates.length === 0
    ? null
    : {
        candidates: candidates.map((candidate) => ({
          ...candidate,
          path: {
            ...candidate.path,
            planningQuality: searchStatus === 'complete' ? 'exact' : 'bounded',
          },
        })),
        searchStatus,
        geometryCandidateChecks,
        geometryRouteRequests,
        geometryRouteCacheHits,
      }
}

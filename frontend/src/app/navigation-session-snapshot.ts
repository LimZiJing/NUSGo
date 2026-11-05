import type { ExploreSnapshot, ExploreState } from '../features/explore/state/explore-state'
import type { TripEndpoint, TripRequest } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { NavigationSessionStartupFailure, NavigationSessionState } from './navigation-session'
import type { ResourceState, ResourceStatusState } from './resource-status'
import type { JourneyState } from './journey-state'
import type { LocationTrackingState } from '../domain/location/types'
import type { JourneyEndpoint, Path, ScoredPathCandidate } from '@nusgo/shared/routing/path'

function freeze<T>(value: T): T {
  return Object.freeze(value) as T
}

function snapshotVenueResult(result: VenueSearchResult | null): VenueSearchResult | null {
  return result === null ? null : freeze({ code: result.code, venue: result.venue })
}

function snapshotPanelSnapshot(snapshot: ExploreSnapshot): ExploreSnapshot {
  return freeze({
    mode: snapshot.mode,
    query: snapshot.query,
    selectedVenue: snapshotVenueResult(snapshot.selectedVenue),
    selectedBuildingId: snapshot.selectedBuildingId,
  })
}

function snapshotExploreState(panel: ExploreState): ExploreState {
  return freeze({
    mode: panel.mode,
    query: panel.query,
    selectedVenue: snapshotVenueResult(panel.selectedVenue),
    selectedBuildingId: panel.selectedBuildingId,
    history: freeze(panel.history.map(snapshotPanelSnapshot)),
  })
}

function snapshotTripRequest(request: TripRequest): TripRequest {
  const isFrozenEndpoint = (endpoint: TripEndpoint | null): boolean => (
    endpoint === null || (
      Object.isFrozen(endpoint) &&
      (!('coordinate' in endpoint) || Object.isFrozen(endpoint.coordinate))
    )
  )
  if (
    Object.isFrozen(request) &&
    isFrozenEndpoint(request.origin) &&
    isFrozenEndpoint(request.destination)
  ) return request

  const snapshotEndpoint = (endpoint: TripEndpoint | null): TripEndpoint | null => {
    if (endpoint === null) return null
    if (endpoint.kind === 'current-location') {
      return freeze({
        kind: 'current-location',
        coordinate: freeze({ ...endpoint.coordinate }),
      })
    }
    if (endpoint.kind === 'personal-waypoint') {
      return freeze({
        kind: 'personal-waypoint',
        id: endpoint.id,
        label: endpoint.label,
        coordinate: freeze({ ...endpoint.coordinate }),
      })
    }
    return freeze({ kind: endpoint.kind, id: endpoint.id })
  }
  return freeze({
    origin: snapshotEndpoint(request.origin),
    destination: snapshotEndpoint(request.destination),
  })
}

function snapshotPathEndpoint(endpoint: JourneyEndpoint): JourneyEndpoint {
  if (endpoint.kind === 'current-location' || endpoint.kind === 'waypoint-coordinate') {
    return freeze({
      kind: endpoint.kind,
      coordinate: freeze({ ...endpoint.coordinate }),
    })
  }
  return freeze({ kind: endpoint.kind, id: endpoint.id })
}

function isFrozenPathEndpoint(endpoint: JourneyEndpoint): boolean {
  return Object.isFrozen(endpoint) && (
    !('coordinate' in endpoint) || Object.isFrozen(endpoint.coordinate)
  )
}

function isFrozenPath(path: Path): boolean {
  if (
    !Object.isFrozen(path) ||
    !isFrozenPathEndpoint(path.origin) ||
    !isFrozenPathEndpoint(path.destination) ||
    !Object.isFrozen(path.legs)
  ) return false

  return path.legs.every((leg) => (
    Object.isFrozen(leg) &&
    isFrozenPathEndpoint(leg.from) &&
    isFrozenPathEndpoint(leg.to) &&
    Object.isFrozen(leg.geometry) &&
    Object.isFrozen(leg.geometry.coordinates) &&
    leg.geometry.coordinates.every(Object.isFrozen)
  ))
}

function snapshotPath(path: Path, snapshots: Map<Path, Path>): Path {
  const cached = snapshots.get(path)
  if (cached) return cached

  // A shallow Object.freeze does not make nested geometry safe to reuse.
  if (isFrozenPath(path)) {
    snapshots.set(path, path)
    return path
  }

  const legs = path.legs.map((leg) => freeze({
    ...leg,
    from: snapshotPathEndpoint(leg.from),
    to: snapshotPathEndpoint(leg.to),
    geometry: freeze({
      ...leg.geometry,
      coordinates: freeze(leg.geometry.coordinates.map((coordinate) => (
        freeze([coordinate[0], coordinate[1]] as const)
      ))),
    }),
  }))
  const snapshot = freeze({
    ...path,
    origin: snapshotPathEndpoint(path.origin),
    destination: snapshotPathEndpoint(path.destination),
    legs: freeze(legs),
  })
  snapshots.set(path, snapshot)
  return snapshot
}

function hasFrozenPath(path: Path, snapshots: Map<Path, Path>): boolean {
  const cached = snapshots.get(path)
  if (cached) return cached === path
  if (!isFrozenPath(path)) return false
  snapshots.set(path, path)
  return true
}

function snapshotCandidate(
  candidate: ScoredPathCandidate,
  paths: Map<Path, Path>,
  snapshots: Map<ScoredPathCandidate, ScoredPathCandidate>,
): ScoredPathCandidate {
  const cached = snapshots.get(candidate)
  if (cached) return cached

  if (Object.isFrozen(candidate) && hasFrozenPath(candidate.path, paths)) {
    snapshots.set(candidate, candidate)
    return candidate
  }

  const snapshot = freeze({ ...candidate, path: snapshotPath(candidate.path, paths) })
  snapshots.set(candidate, snapshot)
  return snapshot
}

function isFrozenJourneyState(
  state: JourneyState,
  paths: Map<Path, Path>,
): boolean {
  if (
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.candidates) ||
    !Object.isFrozen(state.displayedCandidates) ||
    (state.path !== null && !hasFrozenPath(state.path, paths))
  ) return false

  for (const candidate of state.candidates) {
    if (!Object.isFrozen(candidate) || !hasFrozenPath(candidate.path, paths)) return false
  }
  for (const candidate of state.displayedCandidates) {
    if (!Object.isFrozen(candidate) || !hasFrozenPath(candidate.path, paths)) return false
  }
  return true
}

function snapshotJourneyState(state: JourneyState): JourneyState {
  const paths = new Map<Path, Path>()
  if (isFrozenJourneyState(state, paths)) return state
  const candidates = new Map<ScoredPathCandidate, ScoredPathCandidate>()

  const snapshot = freeze({
    ...state,
    path: state.path === null ? null : snapshotPath(state.path, paths),
    candidates: freeze(state.candidates.map((candidate) => (
      snapshotCandidate(candidate, paths, candidates)
    ))),
    displayedCandidates: freeze(state.displayedCandidates.map((candidate) => (
      snapshotCandidate(candidate, paths, candidates)
    ))),
  })
  return snapshot
}

function snapshotLocationState(state: LocationTrackingState): LocationTrackingState {
  return freeze({
    status: state.status,
    latestFix: state.latestFix === null ? null : freeze({ ...state.latestFix }),
  })
}

function snapshotResourceState<T>(resource: ResourceState<T>): ResourceState<T> {
  if (resource.status === 'pending') return freeze({ status: 'pending' })
  if (resource.status === 'failed') return freeze({ status: 'failed', message: resource.message })
  return freeze({ status: 'loaded', value: resource.value })
}

function snapshotResourceStatus(status: ResourceStatusState): ResourceStatusState {
  const transit = status.transit.status === 'loaded'
    ? freeze({ status: 'loaded' as const, value: freeze({ ...status.transit.value }) })
    : status.transit.status === 'failed'
      ? freeze({ status: 'failed' as const, message: status.transit.message })
      : freeze({ status: 'pending' as const })
  return freeze({ venue: snapshotResourceState(status.venue), transit })
}

function snapshotStartupFailure(
  failure: NavigationSessionStartupFailure | null,
): NavigationSessionStartupFailure | null {
  return failure === null ? null : freeze({ message: failure.message })
}

export function freezeNavigationSessionSnapshot(state: NavigationSessionState): NavigationSessionState {
  return freeze({
    ...state,
    exploreState: snapshotExploreState(state.exploreState),
    tripRequest: snapshotTripRequest(state.tripRequest),
    path: snapshotJourneyState(state.path),
    location: snapshotLocationState(state.location),
    originLocationRequest: freeze({ ...state.originLocationRequest }),
    resourceStatus: snapshotResourceStatus(state.resourceStatus),
    startupFailure: snapshotStartupFailure(state.startupFailure),
  })
}

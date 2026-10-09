import type { ExploreViewSnapshot, ExploreViewState } from '../features/explore-view/state'
import type { TripEndpoint, TripRequest } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { NavigationSessionStartupFailure, NavigationSessionState } from './navigation-session'
import type { ResourceState, ResourceStatusState } from './resource-status'
import type { JourneyState } from './journey-state'
import type { LocationTrackingState } from '../domain/location/types'

function freeze<T>(value: T): T {
  return Object.freeze(value) as T
}

function snapshotVenueResult(result: VenueSearchResult | null): VenueSearchResult | null {
  return result === null ? null : freeze({ code: result.code, venue: result.venue })
}

function snapshotPanelSnapshot(snapshot: ExploreViewSnapshot): ExploreViewSnapshot {
  return freeze({
    mode: snapshot.mode,
    query: snapshot.query,
    selectedVenue: snapshotVenueResult(snapshot.selectedVenue),
  })
}

function snapshotExploreView(panel: ExploreViewState): ExploreViewState {
  return freeze({
    mode: panel.mode,
    query: panel.query,
    selectedVenue: snapshotVenueResult(panel.selectedVenue),
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
    return freeze({ kind: endpoint.kind, id: endpoint.id })
  }
  return freeze({
    origin: snapshotEndpoint(request.origin),
    destination: snapshotEndpoint(request.destination),
  })
}

function snapshotJourneyState(state: JourneyState): JourneyState {
  const snapshotJourney = (journey: JourneyState['journey']): JourneyState['journey'] => {
    if (journey === null) return null
    const legs = journey.legs.map((leg) => freeze({
      ...leg,
      from: freeze({ ...leg.from }),
      to: freeze({ ...leg.to }),
      geometry: freeze({
        ...leg.geometry,
        coordinates: freeze(leg.geometry.coordinates.map((coordinate) => (
          freeze([coordinate[0], coordinate[1]] as const)
        ))),
      }),
    }))
    return freeze({
      ...journey,
      origin: freeze({ ...journey.origin }),
      destination: freeze({ ...journey.destination }),
      legs: freeze(legs),
    })
  }
  return freeze({
    ...state,
    journey: snapshotJourney(state.journey),
    candidates: freeze(state.candidates.map((candidate) => freeze({
      ...candidate,
      journey: snapshotJourney(candidate.journey)!,
    }))),
    displayedCandidates: freeze(state.displayedCandidates.map((candidate) => freeze({
      ...candidate,
      journey: snapshotJourney(candidate.journey)!,
    }))),
  })
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
    exploreView: snapshotExploreView(state.exploreView),
    tripRequest: snapshotTripRequest(state.tripRequest),
    journey: snapshotJourneyState(state.journey),
    location: snapshotLocationState(state.location),
    originLocationRequest: freeze({ ...state.originLocationRequest }),
    resourceStatus: snapshotResourceStatus(state.resourceStatus),
    startupFailure: snapshotStartupFailure(state.startupFailure),
  })
}

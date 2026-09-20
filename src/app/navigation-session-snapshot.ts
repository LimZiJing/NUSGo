import type { ContextualPanelSnapshot, ContextualPanelState } from '../domain/contextual-panel/state'
import type { TripEndpoint, TripRequest } from '../domain/trip/types'
import type { VenueSearchResult } from '../domain/venue/search'
import type { NavigationSessionStartupFailure, NavigationSessionState } from './navigation-session'
import type { ResourceState, ResourceStatusState } from './resource-status'

function freeze<T>(value: T): T {
  return Object.freeze(value) as T
}

function snapshotVenueResult(result: VenueSearchResult | null): VenueSearchResult | null {
  return result === null ? null : freeze({ code: result.code, venue: result.venue })
}

function snapshotPanelSnapshot(snapshot: ContextualPanelSnapshot): ContextualPanelSnapshot {
  return freeze({
    mode: snapshot.mode,
    query: snapshot.query,
    selectedVenue: snapshotVenueResult(snapshot.selectedVenue),
  })
}

function snapshotContextualPanel(panel: ContextualPanelState): ContextualPanelState {
  return freeze({
    mode: panel.mode,
    query: panel.query,
    selectedVenue: snapshotVenueResult(panel.selectedVenue),
    history: freeze(panel.history.map(snapshotPanelSnapshot)),
  })
}

function snapshotTripRequest(request: TripRequest): TripRequest {
  if (
    Object.isFrozen(request) &&
    (request.origin === null || Object.isFrozen(request.origin)) &&
    (request.destination === null || Object.isFrozen(request.destination))
  ) return request

  const snapshotEndpoint = (endpoint: TripEndpoint | null): TripEndpoint | null => (
    endpoint === null ? null : freeze({ kind: endpoint.kind, id: endpoint.id })
  )
  return freeze({
    origin: snapshotEndpoint(request.origin),
    destination: snapshotEndpoint(request.destination),
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
    contextualPanel: snapshotContextualPanel(state.contextualPanel),
    tripRequest: snapshotTripRequest(state.tripRequest),
    resourceStatus: snapshotResourceStatus(state.resourceStatus),
    startupFailure: snapshotStartupFailure(state.startupFailure),
  })
}

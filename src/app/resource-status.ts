export type ResourceState<T> =
  | { readonly status: 'pending' }
  | { readonly status: 'loaded'; readonly value: T }
  | { readonly status: 'failed'; readonly message: string }

export interface TransitResourceSummary {
  readonly stopCount: number
  readonly routeCount: number
}

export interface ResourceStatusState {
  readonly venue: ResourceState<number>
  readonly transit: ResourceState<TransitResourceSummary>
}

export function createInitialResourceStatus(): ResourceStatusState {
  return {
    venue: { status: 'pending' },
    transit: { status: 'pending' },
  }
}

export function markVenueLoaded(
  state: ResourceStatusState,
  venueCount: number,
): ResourceStatusState {
  return { ...state, venue: { status: 'loaded', value: venueCount } }
}

export function markVenueFailed(
  state: ResourceStatusState,
  message: string,
): ResourceStatusState {
  return { ...state, venue: { status: 'failed', message } }
}

export function markTransitLoaded(
  state: ResourceStatusState,
  summary: TransitResourceSummary,
): ResourceStatusState {
  return { ...state, transit: { status: 'loaded', value: summary } }
}

export function markTransitFailed(
  state: ResourceStatusState,
  message: string,
): ResourceStatusState {
  return { ...state, transit: { status: 'failed', message } }
}

export function deriveResourceStatus(state: ResourceStatusState): string {
  const venueFailure = state.venue.status === 'failed' ? state.venue.message : null
  const transitFailure = state.transit.status === 'failed' ? state.transit.message : null

  if (venueFailure && transitFailure) return `${venueFailure}; ${transitFailure}`
  if (venueFailure) {
    if (state.transit.status === 'loaded') {
      return `${state.transit.value.stopCount} shuttle stops · ${state.transit.value.routeCount} shuttle routes loaded; ${venueFailure}`
    }
    return venueFailure
  }
  if (transitFailure) {
    if (state.venue.status === 'loaded') {
      return `${state.venue.value} venues available; ${transitFailure}`
    }
    return transitFailure
  }

  if (state.venue.status === 'loaded' && state.transit.status === 'loaded') {
    return `${state.venue.value} venues · ${state.transit.value.stopCount} shuttle stops · ${state.transit.value.routeCount} shuttle routes loaded`
  }
  if (state.venue.status === 'loaded') {
    return `${state.venue.value} venues available; loading shuttle routes…`
  }
  if (state.transit.status === 'loaded') {
    return `${state.transit.value.stopCount} shuttle stops · ${state.transit.value.routeCount} shuttle routes loaded; loading venue data…`
  }
  return 'Loading map data…'
}

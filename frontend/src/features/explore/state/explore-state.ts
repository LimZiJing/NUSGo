import type { VenueSearchResult } from '../../../domain/venue/search'

export type ExploreMode =
  | 'neutral'
  | 'venue-search'
  | 'venue-detail'
  | 'bus-routes'

export interface ExploreState {
  readonly mode: ExploreMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
  /** A selected building or repeated-name group; never set together with selectedVenue. */
  readonly selectedBuildingId: string | null
  readonly history: readonly ExploreSnapshot[]
}

export interface ExploreSnapshot {
  readonly mode: ExploreMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
  readonly selectedBuildingId: string | null
}

export type ExploreAction =
  | { type: 'set-query'; query: string }
  | { type: 'select-venue'; result: VenueSearchResult }
  | { type: 'select-building'; buildingId: string }
  | { type: 'open-bus-routes' }
  | { type: 'back' }
  | { type: 'escape' }
  | { type: 'close-to-root' }
  | { type: 'map-click' }

/**
 * Explore opens on Bus routes, so the route list is available the moment someone enters it.
 *
 * `neutral` remains the root a rider returns to: leaving Bus routes or closing map context lands
 * there, and it shows venue search. Neither the initial choice nor a later manual one is reset by
 * switching top-level tabs or crossing the mobile/desktop breakpoint, because they live in this
 * session state rather than in either layout.
 */
export function createInitialExploreState(): ExploreState {
  return {
    mode: 'bus-routes',
    query: '',
    selectedVenue: null,
    selectedBuildingId: null,
    history: [],
  }
}

function createSnapshot(state: ExploreState): ExploreSnapshot {
  return {
    mode: state.mode,
    query: state.query,
    selectedVenue: state.selectedVenue,
    selectedBuildingId: state.selectedBuildingId,
  }
}

function pushCurrentState(
  state: ExploreState,
  next: ExploreSnapshot,
): ExploreState {
  return {
    ...next,
    history: [...state.history, createSnapshot(state)],
  }
}

function closePanel(state: ExploreState): ExploreState {
  return {
    mode: 'neutral',
    query: state.query,
    selectedVenue: null,
    selectedBuildingId: null,
    history: [],
  }
}

function goBack(state: ExploreState): ExploreState {
  const previous = state.history.at(-1)
  if (!previous) return closePanel(state)

  return {
    ...previous,
    history: state.history.slice(0, -1),
  }
}

export function exploreReducer(
  state: ExploreState,
  action: ExploreAction,
): ExploreState {
  switch (action.type) {
    case 'set-query':
      return { ...state, query: action.query }
    case 'select-venue':
      return pushCurrentState(state, {
        mode: 'venue-detail',
        query: state.query,
        selectedVenue: action.result,
        selectedBuildingId: null,
      })
    case 'select-building':
      return pushCurrentState(state, {
        mode: 'venue-detail',
        query: state.query,
        selectedVenue: null,
        selectedBuildingId: action.buildingId,
      })
    case 'open-bus-routes':
      if (state.mode === 'bus-routes') return state
      return pushCurrentState(state, {
        mode: 'bus-routes',
        query: state.query,
        selectedVenue: null,
        selectedBuildingId: null,
      })
    case 'back':
      return goBack(state)
    case 'escape':
      return goBack(state)
    case 'close-to-root':
      return {
        ...state,
        mode: 'neutral',
        history: [],
      }
    case 'map-click':
      return state.mode === 'venue-detail' ? closePanel(state) : state
  }
}

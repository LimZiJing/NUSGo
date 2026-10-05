import type { VenueSearchResult } from '../../domain/venue/search'

export type ExploreViewMode =
  | 'neutral'
  | 'venue-search'
  | 'venue-detail'
  | 'shuttle'

export interface ExploreViewState {
  readonly mode: ExploreViewMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
  readonly history: readonly ExploreViewSnapshot[]
}

export interface ExploreViewSnapshot {
  readonly mode: ExploreViewMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
}

export type ExploreViewAction =
  | { type: 'set-query'; query: string }
  | { type: 'select-venue'; result: VenueSearchResult }
  | { type: 'open-shuttle' }
  | { type: 'back' }
  | { type: 'escape' }
  | { type: 'close-to-root' }
  | { type: 'map-click' }

export function createInitialExploreViewState(): ExploreViewState {
  return {
    mode: 'neutral',
    query: '',
    selectedVenue: null,
    history: [],
  }
}

function createSnapshot(state: ExploreViewState): ExploreViewSnapshot {
  return {
    mode: state.mode,
    query: state.query,
    selectedVenue: state.selectedVenue,
  }
}

function pushCurrentState(
  state: ExploreViewState,
  next: ExploreViewSnapshot,
): ExploreViewState {
  return {
    ...next,
    history: [...state.history, createSnapshot(state)],
  }
}

function closePanel(state: ExploreViewState): ExploreViewState {
  return {
    mode: 'neutral',
    query: state.query,
    selectedVenue: null,
    history: [],
  }
}

function goBack(state: ExploreViewState): ExploreViewState {
  const previous = state.history.at(-1)
  if (!previous) return closePanel(state)

  return {
    ...previous,
    history: state.history.slice(0, -1),
  }
}

export function exploreViewReducer(
  state: ExploreViewState,
  action: ExploreViewAction,
): ExploreViewState {
  switch (action.type) {
    case 'set-query':
      return { ...state, query: action.query }
    case 'select-venue':
      return pushCurrentState(state, {
        mode: 'venue-detail',
        query: state.query,
        selectedVenue: action.result,
      })
    case 'open-shuttle':
      if (state.mode === 'shuttle') return state
      return pushCurrentState(state, {
        mode: 'shuttle',
        query: state.query,
        selectedVenue: null,
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

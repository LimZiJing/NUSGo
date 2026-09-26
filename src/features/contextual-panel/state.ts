import type { VenueSearchResult } from '../../domain/venue/search'

export type ContextualPanelMode =
  | 'neutral'
  | 'venue-search'
  | 'venue-detail'
  | 'shuttle'
  | 'shuttle-route-detail'

export interface ContextualPanelState {
  readonly mode: ContextualPanelMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
  readonly history: readonly ContextualPanelSnapshot[]
}

export interface ContextualPanelSnapshot {
  readonly mode: ContextualPanelMode
  readonly query: string
  readonly selectedVenue: VenueSearchResult | null
}

export type ContextualPanelAction =
  | { type: 'set-query'; query: string }
  | { type: 'select-venue'; result: VenueSearchResult }
  | { type: 'open-venue-search' }
  | { type: 'open-shuttle' }
  | { type: 'open-shuttle-route-detail' }
  | { type: 'back' }
  | { type: 'escape' }
  | { type: 'close' }
  | { type: 'close-to-root' }
  | { type: 'map-click' }

export function createInitialContextualPanelState(): ContextualPanelState {
  return {
    mode: 'venue-search',
    query: '',
    selectedVenue: null,
    history: [],
  }
}

function createSnapshot(state: ContextualPanelState): ContextualPanelSnapshot {
  return {
    mode: state.mode,
    query: state.query,
    selectedVenue: state.selectedVenue,
  }
}

function pushCurrentState(
  state: ContextualPanelState,
  next: ContextualPanelSnapshot,
): ContextualPanelState {
  return {
    ...next,
    history: [...state.history, createSnapshot(state)],
  }
}

function closePanel(state: ContextualPanelState): ContextualPanelState {
  return {
    mode: 'neutral',
    query: state.query,
    selectedVenue: null,
    history: [],
  }
}

function goBack(state: ContextualPanelState): ContextualPanelState {
  const previous = state.history.at(-1)
  if (!previous) return closePanel(state)

  return {
    ...previous,
    history: state.history.slice(0, -1),
  }
}

export function contextualPanelReducer(
  state: ContextualPanelState,
  action: ContextualPanelAction,
): ContextualPanelState {
  switch (action.type) {
    case 'set-query':
      return { ...state, query: action.query }
    case 'select-venue':
      return pushCurrentState(state, {
        mode: 'venue-detail',
        query: state.query,
        selectedVenue: action.result,
      })
    case 'open-venue-search':
      if (state.mode === 'venue-search') return state
      return pushCurrentState(state, {
        mode: 'venue-search',
        query: state.query,
        selectedVenue: null,
      })
    case 'open-shuttle':
      if (state.mode === 'shuttle') return state
      return pushCurrentState(state, {
        mode: 'shuttle',
        query: state.query,
        selectedVenue: null,
      })
    case 'open-shuttle-route-detail':
      if (state.mode !== 'shuttle') return state
      return pushCurrentState(state, {
        mode: 'shuttle-route-detail',
        query: state.query,
        selectedVenue: null,
      })
    case 'back':
      return goBack(state)
    case 'escape':
      return goBack(state)
    case 'close':
      return closePanel(state)
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

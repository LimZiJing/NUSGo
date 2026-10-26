export type StopList = 'nearby' | 'favourites'

export interface StopsState {
  readonly focusedStopId: string | null
  readonly list: StopList
  readonly expandedStopIds: Readonly<Record<StopList, readonly string[]>>
  readonly favoriteStopIds: readonly string[]
  readonly locationNoticeDismissed: boolean
}

export type StopsAction =
  | { readonly type: 'focus-stop'; readonly stopId: string }
  | { readonly type: 'back-to-stops' }
  | { readonly type: 'select-list'; readonly list: StopList }
  | { readonly type: 'toggle-expanded'; readonly stopId: string }
  | { readonly type: 'set-nearby-expanded'; readonly stopIds: readonly string[] }
  | { readonly type: 'toggle-favorite'; readonly stopId: string }
  | { readonly type: 'remove-favorite'; readonly stopId: string }
  | { readonly type: 'clear-favorites' }
  | { readonly type: 'reorder-favourites'; readonly stopId: string; readonly neighborId: string }
  | { readonly type: 'reconcile-stops'; readonly stopIds: ReadonlySet<string> }
  | { readonly type: 'dismiss-location-notice' }

export function createInitialStopsState(favoriteStopIds: readonly string[] = []): StopsState {
  return {
    focusedStopId: null,
    list: 'nearby',
    expandedStopIds: { nearby: [], favourites: [] },
    favoriteStopIds,
    locationNoticeDismissed: false,
  }
}
export function stopsReducer(
  state: StopsState,
  action: StopsAction,
): StopsState {
  switch (action.type) {
    case 'focus-stop':
      return state.focusedStopId === action.stopId
        ? state
        : { ...state, focusedStopId: action.stopId }
    case 'back-to-stops':
      return state.focusedStopId === null ? state : { ...state, focusedStopId: null }
    case 'select-list':
      return state.list === action.list
        ? state
        : { ...state, list: action.list }
    case 'toggle-expanded': {
      const expandedStopIds = state.expandedStopIds[state.list]
      const nextExpandedStopIds = expandedStopIds.includes(action.stopId)
        ? expandedStopIds.filter((id) => id !== action.stopId)
        : [...expandedStopIds, action.stopId]
      return {
        ...state,
        expandedStopIds: {
          ...state.expandedStopIds,
          [state.list]: nextExpandedStopIds,
        },
      }
    }
    case 'set-nearby-expanded': {
      const expandedStopIds = [...new Set(action.stopIds)]
      if (
        expandedStopIds.length === state.expandedStopIds.nearby.length &&
        expandedStopIds.every((stopId, index) => stopId === state.expandedStopIds.nearby[index])
      ) return state
      return {
        ...state,
        expandedStopIds: {
          ...state.expandedStopIds,
          nearby: expandedStopIds,
        },
      }
    }
    case 'toggle-favorite':
      return {
        ...state,
        favoriteStopIds: state.favoriteStopIds.includes(action.stopId)
          ? state.favoriteStopIds.filter((id) => id !== action.stopId)
          : [...state.favoriteStopIds, action.stopId],
      }
    case 'remove-favorite': {
      const favoriteStopIds = state.favoriteStopIds.filter((id) => id !== action.stopId)
      return favoriteStopIds.length === state.favoriteStopIds.length
        ? state
        : { ...state, favoriteStopIds }
    }
    case 'clear-favorites':
      return state.favoriteStopIds.length === 0
        ? state
        : { ...state, favoriteStopIds: [] }
    case 'reorder-favourites': {
      const from = state.favoriteStopIds.indexOf(action.stopId)
      const to = state.favoriteStopIds.indexOf(action.neighborId)
      if (from < 0 || to < 0 || from === to) return state
      const favoriteStopIds = [...state.favoriteStopIds]
      const movedStopId = favoriteStopIds[from]
      favoriteStopIds[from] = favoriteStopIds[to]
      favoriteStopIds[to] = movedStopId
      return { ...state, favoriteStopIds }
    }
    case 'reconcile-stops': {
      const favoriteStopIds = state.favoriteStopIds.filter((id) => action.stopIds.has(id))
      const expandedStopIds = {
        nearby: state.expandedStopIds.nearby.filter((id) => action.stopIds.has(id)),
        favourites: state.expandedStopIds.favourites.filter((id) => action.stopIds.has(id)),
      }
      const focusedStopId = state.focusedStopId && action.stopIds.has(state.focusedStopId)
        ? state.focusedStopId
        : null
      if (
        favoriteStopIds.length === state.favoriteStopIds.length &&
        expandedStopIds.nearby.length === state.expandedStopIds.nearby.length &&
        expandedStopIds.favourites.length === state.expandedStopIds.favourites.length &&
        focusedStopId === state.focusedStopId
      ) return state
      return {
        ...state,
        favoriteStopIds,
        expandedStopIds,
        focusedStopId,
      }
    }
    case 'dismiss-location-notice':
      return state.locationNoticeDismissed ? state : { ...state, locationNoticeDismissed: true }
  }
}

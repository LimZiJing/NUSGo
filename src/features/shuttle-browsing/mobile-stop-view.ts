export interface MobileStopViewState {
  readonly focusedStopId: string | null
}

export type MobileStopViewAction =
  | { readonly type: 'focus-stop'; readonly stopId: string }
  | { readonly type: 'back-to-stops' }

export interface MobileStopDeparture {
  readonly routeId: string
  readonly timings: readonly [string, string, string]
}

// Fixed stop-sheet values until arrival timings are supplied by the backend.
const MOBILE_STOP_DEPARTURES: readonly MobileStopDeparture[] = [
  { routeId: 'A1', timings: ['Arr', '8m', '17m'] },
  { routeId: 'A2', timings: ['9m', '11m', '13m'] },
  { routeId: 'D1', timings: ['Left', '6m', '14m'] },
  { routeId: 'D2', timings: ['4m', '12m', '-'] },
  { routeId: 'K', timings: ['3m', '-', '-'] },
  { routeId: 'P', timings: ['10m', '16m', '-'] },
  { routeId: 'R1', timings: ['Arr', '12m', '23m'] },
  { routeId: 'R2', timings: ['Left', '7m', '18m'] },
]

export function createInitialMobileStopViewState(): MobileStopViewState {
  return { focusedStopId: null }
}

export function mobileStopViewReducer(
  state: MobileStopViewState,
  action: MobileStopViewAction,
): MobileStopViewState {
  switch (action.type) {
    case 'focus-stop':
      return state.focusedStopId === action.stopId
        ? state
        : { focusedStopId: action.stopId }
    case 'back-to-stops':
      return state.focusedStopId === null ? state : { focusedStopId: null }
  }
}

export function getMobileStopDepartures(
  servedRouteIds: ReadonlySet<string>,
): readonly MobileStopDeparture[] {
  return MOBILE_STOP_DEPARTURES.filter(({ routeId }) => servedRouteIds.has(routeId))
}

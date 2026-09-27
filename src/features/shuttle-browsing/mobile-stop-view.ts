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

const PUBLIC_SERVICE_TIMINGS: Readonly<Record<string, readonly [string, string, string]>> = {
  '10': ['5m', '14m', '23m'],
  '33': ['Arr', '12m', '24m'],
  '48': ['7m', '19m', '-'],
  '67': ['4m', '16m', '29m'],
  '95': ['8m', '17m', '26m'],
  '96': ['3m', '12m', '-'],
  '151': ['Left', '11m', '22m'],
  '153': ['6m', '18m', '-'],
  '154': ['9m', '21m', '-'],
  '156': ['Arr', '13m', '25m'],
  '170': ['5m', '16m', '-'],
  '183': ['7m', '15m', '28m'],
  '186': ['4m', '14m', '24m'],
  '188': ['10m', '22m', '-'],
  '200': ['6m', '17m', '-'],
  '201': ['9m', '20m', '-'],
}

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

export function getPublicServiceTimings(serviceNumber: string): readonly [string, string, string] {
  return PUBLIC_SERVICE_TIMINGS[serviceNumber] ?? ['7m', '15m', '-']
}

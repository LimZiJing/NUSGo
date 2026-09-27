export interface MobileStopViewState {
  readonly focusedStopId: string | null
  readonly list: 'nearby' | 'favourites'
  readonly expandedStopIds: readonly string[]
  readonly favoriteStopIds: readonly string[]
  readonly locationNoticeDismissed: boolean
}

export type MobileStopViewAction =
  | { readonly type: 'focus-stop'; readonly stopId: string }
  | { readonly type: 'back-to-stops' }
  | { readonly type: 'select-list'; readonly list: MobileStopViewState['list'] }
  | { readonly type: 'toggle-expanded'; readonly stopId: string }
  | { readonly type: 'toggle-favorite'; readonly stopId: string }
  | { readonly type: 'reconcile-stops'; readonly stopIds: ReadonlySet<string> }
  | { readonly type: 'dismiss-location-notice' }

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

export function createInitialMobileStopViewState(favoriteStopIds: readonly string[] = []): MobileStopViewState {
  return {
    focusedStopId: null,
    list: 'nearby',
    expandedStopIds: [],
    favoriteStopIds,
    locationNoticeDismissed: false,
  }
}

export function mobileStopViewReducer(
  state: MobileStopViewState,
  action: MobileStopViewAction,
): MobileStopViewState {
  switch (action.type) {
    case 'focus-stop':
      return state.focusedStopId === action.stopId
        ? state
        : { ...state, focusedStopId: action.stopId }
    case 'back-to-stops':
      return state.focusedStopId === null ? state : { ...state, focusedStopId: null }
    case 'select-list':
      return state.list === action.list ? state : { ...state, list: action.list }
    case 'toggle-expanded':
      return {
        ...state,
        expandedStopIds: state.expandedStopIds.includes(action.stopId)
          ? state.expandedStopIds.filter((id) => id !== action.stopId)
          : [...state.expandedStopIds, action.stopId],
      }
    case 'toggle-favorite':
      return {
        ...state,
        favoriteStopIds: state.favoriteStopIds.includes(action.stopId)
          ? state.favoriteStopIds.filter((id) => id !== action.stopId)
          : [...state.favoriteStopIds, action.stopId],
      }
    case 'reconcile-stops': {
      const favoriteStopIds = state.favoriteStopIds.filter((id) => action.stopIds.has(id))
      const expandedStopIds = state.expandedStopIds.filter((id) => action.stopIds.has(id))
      const focusedStopId = state.focusedStopId && action.stopIds.has(state.focusedStopId)
        ? state.focusedStopId
        : null
      if (
        favoriteStopIds.length === state.favoriteStopIds.length &&
        expandedStopIds.length === state.expandedStopIds.length &&
        focusedStopId === state.focusedStopId
      ) return state
      return { ...state, favoriteStopIds, expandedStopIds, focusedStopId }
    }
    case 'dismiss-location-notice':
      return state.locationNoticeDismissed ? state : { ...state, locationNoticeDismissed: true }
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

export function getMobileStopSheetSelection(
  stop: TransitStop,
  index: TransitIndex,
): MobileStopSheetSelection {
  const oppositeStop = stop.opposite ? index.stopById.get(stop.opposite) : null
  const servedRouteIds = index.routeIdsByStopId.get(stop.id) ?? new Set<string>()
  return {
    id: stop.id,
    longName: stop.longName,
    oppositeStop: oppositeStop ? { id: oppositeStop.id, longName: oppositeStop.longName } : null,
    publicServices: stop.services
      .filter((service) => service.startsWith('PUB:'))
      .map((service) => service.slice('PUB:'.length)),
    departures: getMobileStopDepartures(servedRouteIds).flatMap((departure) => {
      const route = index.routeById.get(departure.routeId)
      return route
        ? [{ ...departure, routeName: route.name, routeColor: route.color }]
        : []
    }),
  }
}
import type { TransitIndex } from '../../domain/transit'
import type { TransitStop } from '../../domain/transit/types'
import type { MobileStopSheetSelection } from './mobile-stops-sheet'

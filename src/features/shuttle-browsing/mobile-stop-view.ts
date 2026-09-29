import { getReachableFavoriteStops, type TransitIndex } from '../../domain/transit'
import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  type ShuttleArrivalSnapshot,
} from '../../domain/transit/arrivals'
import type { TransitStop } from '../../domain/transit/types'
import type { MobileStopSheetSelection } from './mobile-stops-sheet'

export interface MobileStopViewState {
  readonly focusedStopId: string | null
  readonly list: 'nearby' | 'favourites'
  readonly collapsedStopIds: readonly string[]
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
  readonly routeName: string
  readonly routeColor: string
  readonly timings: readonly [string, string, string]
}

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
    collapsedStopIds: [],
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
        collapsedStopIds: state.collapsedStopIds.includes(action.stopId)
          ? state.collapsedStopIds.filter((id) => id !== action.stopId)
          : [...state.collapsedStopIds, action.stopId],
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
      const collapsedStopIds = state.collapsedStopIds.filter((id) => action.stopIds.has(id))
      const focusedStopId = state.focusedStopId && action.stopIds.has(state.focusedStopId)
        ? state.focusedStopId
        : null
      if (
        favoriteStopIds.length === state.favoriteStopIds.length &&
        collapsedStopIds.length === state.collapsedStopIds.length &&
        focusedStopId === state.focusedStopId
      ) return state
      return { ...state, favoriteStopIds, collapsedStopIds, focusedStopId }
    }
    case 'dismiss-location-notice':
      return state.locationNoticeDismissed ? state : { ...state, locationNoticeDismissed: true }
  }
}

function formatArrivalSeconds(seconds: number): string {
  return seconds <= 60 ? 'Arr' : `${Math.ceil(seconds / 60)}m`
}

function getArrivalAgeMs(snapshot: ShuttleArrivalSnapshot, stopId: string, nowMs: number): number {
  const observedAt = snapshot.stopObservations?.[stopId]?.observedAt ?? snapshot.observedAt
  return Math.max(0, nowMs - Date.parse(observedAt))
}

function getLiveStopDepartures(
  stop: TransitStop,
  index: TransitIndex,
  snapshot: ShuttleArrivalSnapshot | null,
  nowMs: number,
): readonly MobileStopDeparture[] {
  if (!snapshot || getArrivalAgeMs(snapshot, stop.id, nowMs) > SHUTTLE_ARRIVAL_FRESHNESS_MS) return []

  const ageSeconds = Math.floor(getArrivalAgeMs(snapshot, stop.id, nowMs) / 1_000)
  const stopArrivals = snapshot.stops[stop.id] ?? {}
  const servedRouteIds = index.routeIdsByStopId.get(stop.id) ?? new Set<string>()
  return Array.from(servedRouteIds).flatMap((routeId) => {
    const route = index.routeById.get(routeId)
    const arrival = stopArrivals[routeId]
    if (!route || !arrival) return []

    const timings = arrival.upcomingArrivalSeconds
      .map((seconds) => seconds - ageSeconds)
      .filter((seconds) => seconds >= 0)
      .slice(0, 3)
      .map(formatArrivalSeconds)
    if (timings.length === 0) return []

    return [{
      routeId,
      routeName: route.name,
      routeColor: route.color,
      timings: [timings[0], timings[1] ?? '-', timings[2] ?? '-'] as const,
      reachableFavoriteStops: [],
    }]
  })
}

function getLiveArrivalMessage(
  snapshot: ShuttleArrivalSnapshot | null,
  stopId: string,
  nowMs: number,
  departures: readonly MobileStopDeparture[],
): string | null {
  if (!snapshot) return null
  if (getArrivalAgeMs(snapshot, stopId, nowMs) > SHUTTLE_ARRIVAL_FRESHNESS_MS) {
    return 'Live shuttle arrivals are stale.'
  }
  return departures.length === 0 ? 'No live internal shuttle arrivals.' : null
}

export function getPublicServiceTimings(serviceNumber: string): readonly [string, string, string] {
  return PUBLIC_SERVICE_TIMINGS[serviceNumber] ?? ['7m', '15m', '-']
}

export function getMobileStopSheetSelection(
  stop: TransitStop,
  index: TransitIndex,
  favoriteStopIds: readonly string[] = [],
  arrivalSnapshot: ShuttleArrivalSnapshot | null = null,
  nowMs: number,
): MobileStopSheetSelection {
  const oppositeStop = stop.opposite ? index.stopById.get(stop.opposite) : null
  const favorites = new Set(favoriteStopIds)
  const departures = getLiveStopDepartures(stop, index, arrivalSnapshot, nowMs).map((departure) => ({
    ...departure,
    reachableFavoriteStops: getReachableFavoriteStops(index, departure.routeId, stop.id, favorites)
      .map(({ id, shortName }) => ({
        id,
        name: shortName,
        isOpposite: stop.opposite === id,
      })),
  }))
  return {
    id: stop.id,
    longName: stop.longName,
    oppositeStop: oppositeStop ? { id: oppositeStop.id, longName: oppositeStop.longName } : null,
    publicServices: stop.services
      .filter((service) => service.startsWith('PUB:'))
      .map((service) => service.slice('PUB:'.length)),
    departures,
    live: departures.length > 0,
    liveArrivalMessage: getLiveArrivalMessage(arrivalSnapshot, stop.id, nowMs, departures),
  }
}

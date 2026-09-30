import { getReachableFavoriteStops, type TransitIndex } from '../../domain/transit'
import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  SHUTTLE_ARRIVAL_MAX_AGE_MS,
  type ShuttleArrivalSnapshot,
} from '../../domain/transit/arrivals'
import {
  evaluateShuttleService,
  getNextShuttleServiceStart,
  SHUTTLE_SERVICE_START_GRACE_MINUTES,
  type ShuttleServiceWindow,
} from '../../domain/transit/service-hours'
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

export interface MobileStopScheduledDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly message: string
}

type MobileStopServiceWindows = Readonly<Record<string, readonly ShuttleServiceWindow[]>>

interface MobileStopRouteAvailability {
  readonly liveRouteIds: ReadonlySet<string>
  readonly scheduledDepartures: readonly MobileStopScheduledDeparture[]
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

function getArrivalAgeMs(snapshot: ShuttleArrivalSnapshot, nowMs: number): number {
  // Display all stops from one snapshot using the same clock so a refresh swaps
  // the visible timing generation together instead of creating staggered rows.
  return Math.max(0, nowMs - Date.parse(snapshot.observedAt))
}

function getLiveStopDepartures(
  stop: TransitStop,
  index: TransitIndex,
  snapshot: ShuttleArrivalSnapshot | null,
  nowMs: number,
  liveRouteIds: ReadonlySet<string>,
): readonly MobileStopDeparture[] {
  if (!snapshot || getArrivalAgeMs(snapshot, nowMs) > SHUTTLE_ARRIVAL_MAX_AGE_MS) return []

  const ageSeconds = Math.floor(getArrivalAgeMs(snapshot, nowMs) / 1_000)
  const stopArrivals = snapshot.stops[stop.id] ?? {}
  const servedRouteIds = index.routeIdsByStopId.get(stop.id) ?? new Set<string>()
  return Array.from(servedRouteIds).flatMap((routeId) => {
    if (!liveRouteIds.has(routeId)) return []
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
  nowMs: number,
  departures: readonly MobileStopDeparture[],
  scheduledDepartures: readonly MobileStopScheduledDeparture[],
  isRefreshing: boolean,
): string | null {
  if (isRefreshing || scheduledDepartures.length > 0) return null
  if (!snapshot) return null
  if (getArrivalAgeMs(snapshot, nowMs) > SHUTTLE_ARRIVAL_MAX_AGE_MS) return 'No live data'
  if (departures.length > 0) return null
  return 'No live arrivals'
}

function compactStartLabel(label: string): string {
  return label.replace(/^today at /, '').replace(/^tomorrow at /, 'tomorrow ')
}

function getRouteAvailability(
  stop: TransitStop,
  index: TransitIndex,
  serviceWindows: MobileStopServiceWindows | null,
  nowMs: number,
): MobileStopRouteAvailability {
  const routeIds = [...(index.routeIdsByStopId.get(stop.id) ?? new Set<string>())]
  if (!serviceWindows) {
    return { liveRouteIds: new Set(routeIds), scheduledDepartures: [] }
  }

  const liveRouteIds = new Set<string>()
  const scheduledDepartures: MobileStopScheduledDeparture[] = []
  for (const routeId of routeIds) {
    const route = index.routeById.get(routeId)
    const windows = serviceWindows[routeId]
    if (!route || !windows?.length) {
      liveRouteIds.add(routeId)
      continue
    }

    const evaluation = evaluateShuttleService(windows, new Date(nowMs))
    if (evaluation.status === 'active' || evaluation.status === 'unavailable') {
      liveRouteIds.add(routeId)
      continue
    }

    const nextStart = getNextShuttleServiceStart(windows, new Date(nowMs))
    if (!nextStart) {
      liveRouteIds.add(routeId)
      continue
    }
    const message = evaluation.status === 'before-start' &&
      nextStart.minutesUntil <= SHUTTLE_SERVICE_START_GRACE_MINUTES
      ? `First bus in ${Math.max(1, Math.ceil(nextStart.minutesUntil))}m`
      : `Starts ${compactStartLabel(nextStart.label)}`
    scheduledDepartures.push({
      routeId,
      routeName: route.name,
      routeColor: route.color,
      message,
    })
  }

  return { liveRouteIds, scheduledDepartures }
}

export function getMobileStopSheetSelection(
  stop: TransitStop,
  index: TransitIndex,
  favoriteStopIds: readonly string[] = [],
  arrivalSnapshot: ShuttleArrivalSnapshot | null = null,
  nowMs: number,
  serviceWindows: MobileStopServiceWindows | null = null,
  isRefreshing = false,
): MobileStopSheetSelection {
  const oppositeStop = stop.opposite ? index.stopById.get(stop.opposite) : null
  const favorites = new Set(favoriteStopIds)
  const routeAvailability = getRouteAvailability(stop, index, serviceWindows, nowMs)
  const departures = getLiveStopDepartures(
    stop,
    index,
    arrivalSnapshot,
    nowMs,
    routeAvailability.liveRouteIds,
  ).map((departure) => ({
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
    scheduledDepartures: routeAvailability.scheduledDepartures,
    live: departures.length > 0 && !isRefreshing && arrivalSnapshot !== null &&
      getArrivalAgeMs(arrivalSnapshot, nowMs) <= SHUTTLE_ARRIVAL_FRESHNESS_MS,
    liveArrivalMessage: getLiveArrivalMessage(
      arrivalSnapshot,
      nowMs,
      departures,
      routeAvailability.scheduledDepartures,
      isRefreshing,
    ),
  }
}

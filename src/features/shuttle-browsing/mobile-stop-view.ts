import { getReachableFavoriteStops, type TransitIndex } from '../../domain/transit'
import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
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

type MobileStopServiceWindows = Readonly<Record<string, readonly ShuttleServiceWindow[]>>

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
  routeIds: readonly string[],
  serviceWindows: MobileStopServiceWindows | null,
): string | null {
  if (!snapshot) return null
  if (getArrivalAgeMs(snapshot, stopId, nowMs) > SHUTTLE_ARRIVAL_FRESHNESS_MS) return 'Stale live data'
  if (departures.length > 0) return null
  return getServiceAvailabilityMessage(routeIds, serviceWindows, nowMs) ?? 'No live arrivals'
}

function compactStartLabel(label: string): string {
  return label.replace(/^today at /, '').replace(/^tomorrow at /, 'tomorrow ')
}

function getServiceAvailabilityMessage(
  routeIds: readonly string[],
  serviceWindows: MobileStopServiceWindows | null,
  nowMs: number,
): string | null {
  if (!serviceWindows) return null

  const routeWindows = routeIds
    .map((routeId) => serviceWindows[routeId])
    .filter((windows): windows is readonly ShuttleServiceWindow[] => windows !== undefined)
  if (routeWindows.length === 0) return 'No live data'

  const evaluations = routeWindows.map((windows) => ({
    windows,
    evaluation: evaluateShuttleService(windows, new Date(nowMs)),
    nextStart: getNextShuttleServiceStart(windows, new Date(nowMs)),
  }))
  if (evaluations.some(({ evaluation }) => evaluation.status === 'active')) return 'No live arrivals'

  const nextStart = evaluations
    .map(({ evaluation, nextStart }) => ({ evaluation, nextStart }))
    .filter(({ nextStart }) => nextStart !== null)
    .sort((first, second) => first.nextStart!.minutesUntil - second.nextStart!.minutesUntil)[0]
  if (!nextStart?.nextStart) return 'No live data'

  if (nextStart.evaluation.status === 'before-start') {
    if (nextStart.nextStart.minutesUntil <= SHUTTLE_SERVICE_START_GRACE_MINUTES) {
      return `First bus in ${Math.max(1, Math.ceil(nextStart.nextStart.minutesUntil))}m`
    }
    return `Starts ${compactStartLabel(nextStart.nextStart.label)}`
  }

  return `Ended · next ${compactStartLabel(nextStart.nextStart.label)}`
}

export function getMobileStopSheetSelection(
  stop: TransitStop,
  index: TransitIndex,
  favoriteStopIds: readonly string[] = [],
  arrivalSnapshot: ShuttleArrivalSnapshot | null = null,
  nowMs: number,
  serviceWindows: MobileStopServiceWindows | null = null,
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
  const routeIds = [...(index.routeIdsByStopId.get(stop.id) ?? new Set<string>())]
  return {
    id: stop.id,
    longName: stop.longName,
    oppositeStop: oppositeStop ? { id: oppositeStop.id, longName: oppositeStop.longName } : null,
    publicServices: stop.services
      .filter((service) => service.startsWith('PUB:'))
      .map((service) => service.slice('PUB:'.length)),
    departures,
    live: departures.length > 0,
    liveArrivalMessage: getLiveArrivalMessage(arrivalSnapshot, stop.id, nowMs, departures, routeIds, serviceWindows),
  }
}

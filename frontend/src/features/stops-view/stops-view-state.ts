import { getReachableFavoriteStops, type TransitIndex } from '../../domain/transit'
import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  SHUTTLE_ARRIVAL_MAX_AGE_MS,
  type ShuttleArrivalSnapshot,
} from '../../domain/transit/arrivals'
import {
  PUBLIC_BUS_ARRIVAL_FRESHNESS_MS,
  PUBLIC_BUS_ARRIVAL_MAX_AGE_MS,
  type PublicBusArrivalSnapshot,
} from '../../domain/transit/public-bus-arrivals'
import {
  evaluateShuttleService,
  getNextShuttleServiceStart,
  SHUTTLE_SERVICE_START_GRACE_MINUTES,
  type ShuttleServiceWindow,
} from '../../domain/transit/service-hours'
import type { TransitStop } from '../../domain/transit/types'
import type { StopSheetSelection } from './stops-view'
import type { PublicServiceTiming } from './stop-timings'

type StopList = 'nearby' | 'favourites'

export interface StopsViewState {
  readonly focusedStopId: string | null
  readonly list: StopList
  readonly expandedStopIds: Readonly<Record<StopList, readonly string[]>>
  readonly favoriteStopIds: readonly string[]
  readonly locationNoticeDismissed: boolean
}

export type StopsViewAction =
  | { readonly type: 'focus-stop'; readonly stopId: string }
  | { readonly type: 'back-to-stops' }
  | { readonly type: 'select-list'; readonly list: StopList }
  | { readonly type: 'toggle-expanded'; readonly stopId: string }
  | { readonly type: 'set-nearby-expanded'; readonly stopIds: readonly string[] }
  | { readonly type: 'toggle-favorite'; readonly stopId: string }
  | { readonly type: 'reconcile-stops'; readonly stopIds: ReadonlySet<string> }
  | { readonly type: 'dismiss-location-notice' }

export interface StopRouteDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly timings: readonly [string, string, string]
}

export interface StopRouteScheduledDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly message: string
}

type StopsServiceWindows = Readonly<Record<string, readonly ShuttleServiceWindow[]>>

interface StopRouteAvailability {
  readonly liveRouteIds: ReadonlySet<string>
  readonly scheduledDepartures: readonly StopRouteScheduledDeparture[]
}

export function createInitialStopsViewState(favoriteStopIds: readonly string[] = []): StopsViewState {
  return {
    focusedStopId: null,
    list: 'nearby',
    expandedStopIds: { nearby: [], favourites: [] },
    favoriteStopIds,
    locationNoticeDismissed: false,
  }
}

export function stopsViewReducer(
  state: StopsViewState,
  action: StopsViewAction,
): StopsViewState {
  switch (action.type) {
    case 'focus-stop':
      return state.focusedStopId === action.stopId
        ? state
        : { ...state, focusedStopId: action.stopId }
    case 'back-to-stops':
      return state.focusedStopId === null ? state : { ...state, focusedStopId: null }
    case 'select-list':
      return state.list === action.list ? state : { ...state, list: action.list }
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
        expandedStopIds.every((stopId, index) => stopId === state.expandedStopIds.nearby[index]) &&
        state.expandedStopIds.favourites.length === 0
      ) return state
      return {
        ...state,
        expandedStopIds: {
          ...state.expandedStopIds,
          nearby: expandedStopIds,
          favourites: [],
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
      return { ...state, favoriteStopIds, expandedStopIds, focusedStopId }
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

function getPublicArrivalAgeMs(snapshot: PublicBusArrivalSnapshot, stopId: string, nowMs: number): number {
  const observedAt = snapshot.stops[stopId]?.observedAt ?? snapshot.observedAt
  return Math.max(0, nowMs - Date.parse(observedAt))
}

function getPublicServiceTimings(
  stop: TransitStop,
  snapshot: PublicBusArrivalSnapshot | null,
  nowMs: number,
): readonly PublicServiceTiming[] {
  const serviceNumbers = stop.services
    .filter((service) => service.startsWith('PUB:'))
    .map((service) => service.slice('PUB:'.length))
  if (!snapshot) return serviceNumbers.map((serviceNumber) => ({ serviceNumber, timings: null }))

  const stopData = snapshot.stops[stop.id]
  const stale = getPublicArrivalAgeMs(snapshot, stop.id, nowMs) > PUBLIC_BUS_ARRIVAL_MAX_AGE_MS
  return serviceNumbers.map((serviceNumber) => {
    const service = stopData?.services[serviceNumber]
    if (!service) return { serviceNumber, timings: null, status: 'provider-error' as const }
    if (stale) return { serviceNumber, timings: null, status: 'provider-error' as const }
    if (service.status !== 'live') return { serviceNumber, timings: null, status: service.status }
    const timings = service.arrivals
      .map(({ estimatedAt }) => Math.max(0, (Date.parse(estimatedAt) - nowMs) / 1_000))
      .filter((seconds) => seconds >= 0)
      .slice(0, 3)
      .map(formatArrivalSeconds)
    return timings.length > 0
      ? {
        serviceNumber,
        timings: [timings[0], timings[1] ?? '-', timings[2] ?? '-'] as const,
        status: 'live' as const,
      }
      : { serviceNumber, timings: null, status: 'no-estimate' as const }
  })
}

function getLiveStopDepartures(
  stop: TransitStop,
  index: TransitIndex,
  snapshot: ShuttleArrivalSnapshot | null,
  nowMs: number,
  liveRouteIds: ReadonlySet<string>,
): readonly StopRouteDeparture[] {
  if (!snapshot || getArrivalAgeMs(snapshot, stop.id, nowMs) > SHUTTLE_ARRIVAL_MAX_AGE_MS) return []

  const ageSeconds = Math.floor(getArrivalAgeMs(snapshot, stop.id, nowMs) / 1_000)
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
  stopId: string,
  nowMs: number,
  departures: readonly StopRouteDeparture[],
  scheduledDepartures: readonly StopRouteScheduledDeparture[],
  isRefreshing: boolean,
  publicArrivalSnapshot: PublicBusArrivalSnapshot | null,
): string | null {
  if (isRefreshing || scheduledDepartures.length > 0) return null
  if (publicArrivalSnapshot?.stops[stopId]) return null
  if (!snapshot) return null
  if (getArrivalAgeMs(snapshot, stopId, nowMs) > SHUTTLE_ARRIVAL_MAX_AGE_MS) return 'No live data'
  if (departures.length > 0) return null
  return 'No live arrivals'
}

function compactStartLabel(label: string): string {
  return label.replace(/^today at /, '').replace(/^tomorrow at /, 'tomorrow ')
}

function getRouteAvailability(
  stop: TransitStop,
  index: TransitIndex,
  serviceWindows: StopsServiceWindows | null,
  nowMs: number,
): StopRouteAvailability {
  const routeIds = [...(index.routeIdsByStopId.get(stop.id) ?? new Set<string>())]
  if (!serviceWindows) {
    return { liveRouteIds: new Set(routeIds), scheduledDepartures: [] }
  }

  const liveRouteIds = new Set<string>()
  const scheduledDepartures: StopRouteScheduledDeparture[] = []
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

export function getStopSheetSelection(
  stop: TransitStop,
  index: TransitIndex,
  favoriteStopIds: readonly string[] = [],
  arrivalSnapshot: ShuttleArrivalSnapshot | null = null,
  nowMs: number,
  serviceWindows: StopsServiceWindows | null = null,
  isRefreshing = false,
  publicArrivalSnapshot: PublicBusArrivalSnapshot | null = null,
  publicIsRefreshing = false,
): StopSheetSelection {
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
  const publicServices = getPublicServiceTimings(stop, publicArrivalSnapshot, nowMs)
  return {
    id: stop.id,
    longName: stop.longName,
    oppositeStop: oppositeStop ? { id: oppositeStop.id, longName: oppositeStop.longName } : null,
    publicServices,
    departures,
    scheduledDepartures: routeAvailability.scheduledDepartures,
    live: (
      !isRefreshing && departures.length > 0 && arrivalSnapshot !== null &&
      getArrivalAgeMs(arrivalSnapshot, stop.id, nowMs) <= SHUTTLE_ARRIVAL_FRESHNESS_MS
    ) || (
      !isRefreshing && !publicIsRefreshing &&
      publicServices.some(({ timings, status }) => timings !== null && status === 'live') &&
      publicArrivalSnapshot !== null &&
      getPublicArrivalAgeMs(publicArrivalSnapshot, stop.id, nowMs) <= PUBLIC_BUS_ARRIVAL_FRESHNESS_MS
    ),
    liveArrivalMessage: getLiveArrivalMessage(
      arrivalSnapshot,
      stop.id,
      nowMs,
      departures,
      routeAvailability.scheduledDepartures,
      isRefreshing,
      publicArrivalSnapshot,
    ),
  }
}

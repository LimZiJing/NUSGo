import { getReachableFavoriteStops, type TransitIndex } from '../../../domain/transit'
import {
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  SHUTTLE_ARRIVAL_MAX_AGE_MS,
  type ShuttleArrivalSnapshot,
} from '../../../domain/transit/arrivals'
import {
  PUBLIC_BUS_ARRIVAL_FRESHNESS_MS,
  PUBLIC_BUS_ARRIVAL_MAX_AGE_MS,
  type PublicBusArrivalSnapshot,
} from '../../../domain/transit/public-bus-arrivals'
import {
  evaluateShuttleService,
  getNextShuttleServiceStart,
  SHUTTLE_SERVICE_START_GRACE_MINUTES,
  type ShuttleServiceWindow,
} from '../../../domain/transit/service-hours'
import type { TransitStop } from '@nusgo/shared/transit/types'

export interface StopFavouriteDestination {
  readonly id: string
  readonly name: string
  readonly isOpposite: boolean
}

export interface StopDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly timings: readonly [string, string, string]
  readonly reachableFavouriteStops?: readonly StopFavouriteDestination[]
}

export interface PublicServiceTiming {
  readonly serviceNumber: string
  readonly timings: readonly [string, string, string] | null
  readonly status?: 'live' | 'no-estimate' | 'not-in-operation' | 'provider-error'
}

export interface StopScheduledDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly message: string
}

export type StopsServiceWindows = Readonly<Record<string, readonly ShuttleServiceWindow[]>>

interface StopRouteAvailability {
  readonly liveRouteIds: ReadonlySet<string>
  readonly scheduledDepartures: readonly StopScheduledDeparture[]
}

export interface StopTimingDataOptions {
  readonly favoriteStopIds?: readonly string[]
  readonly arrivalSnapshot?: ShuttleArrivalSnapshot | null
  readonly nowMs: number
  readonly serviceWindows?: StopsServiceWindows | null
  readonly isRefreshing?: boolean
  readonly publicArrivalSnapshot?: PublicBusArrivalSnapshot | null
  readonly publicIsRefreshing?: boolean
}

export interface StopTimingData {
  readonly publicServices: readonly PublicServiceTiming[]
  readonly departures: readonly StopDeparture[]
  readonly scheduledDepartures: readonly StopScheduledDeparture[]
  readonly live: boolean
  readonly liveArrivalMessage: string | null
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
): readonly StopDeparture[] {
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
      reachableFavouriteStops: [],
    }]
  })
}

function getLiveArrivalMessage(
  snapshot: ShuttleArrivalSnapshot | null,
  stopId: string,
  nowMs: number,
  departures: readonly StopDeparture[],
  scheduledDepartures: readonly StopScheduledDeparture[],
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
  const scheduledDepartures: StopScheduledDeparture[] = []
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

export function getStopTimingData(
  stop: TransitStop,
  index: TransitIndex,
  {
    favoriteStopIds = [],
    arrivalSnapshot = null,
    nowMs,
    serviceWindows = null,
    isRefreshing = false,
    publicArrivalSnapshot = null,
    publicIsRefreshing = false,
  }: StopTimingDataOptions,
): StopTimingData {
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
    reachableFavouriteStops: getReachableFavoriteStops(index, departure.routeId, stop.id, favorites)
      .map(({ id, shortName }) => ({
        id,
        name: shortName,
        isOpposite: stop.opposite === id,
      })),
  }))
  const publicServices = getPublicServiceTimings(stop, publicArrivalSnapshot, nowMs)
  const live = (
    !isRefreshing && departures.length > 0 && arrivalSnapshot !== null &&
    getArrivalAgeMs(arrivalSnapshot, stop.id, nowMs) <= SHUTTLE_ARRIVAL_FRESHNESS_MS
  ) || (
    !isRefreshing && !publicIsRefreshing &&
    publicServices.some(({ timings, status }) => timings !== null && status === 'live') &&
    publicArrivalSnapshot !== null &&
    getPublicArrivalAgeMs(publicArrivalSnapshot, stop.id, nowMs) <= PUBLIC_BUS_ARRIVAL_FRESHNESS_MS
  )
  const liveArrivalMessage = getLiveArrivalMessage(
    arrivalSnapshot,
    stop.id,
    nowMs,
    departures,
    routeAvailability.scheduledDepartures,
    isRefreshing,
    publicArrivalSnapshot,
  )

  return {
    publicServices,
    departures,
    scheduledDepartures: routeAvailability.scheduledDepartures,
    live,
    liveArrivalMessage,
  }
}

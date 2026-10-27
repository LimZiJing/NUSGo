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
import {
  DEFAULT_MINUTE_FORMAT,
  formatMinutes,
  type MinuteFormat,
} from '../../../domain/trip/minute-format'

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
  /** Set for a `not-in-operation` service whose next first bus is known. */
  readonly startMessage?: string
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
  readonly minuteFormat?: MinuteFormat
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
export const LIVE_TIMES_UNAVAILABLE_MESSAGE = 'Live times unavailable'

function formatArrivalSeconds(seconds: number, minuteFormat: MinuteFormat): string {
  return seconds < 30 ? 'Arr' : formatMinutes(Math.ceil(seconds / 60), minuteFormat)
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
  minuteFormat: MinuteFormat,
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
    if (service.status !== 'live') {
      const startMessage = service.status === 'not-in-operation' && service.nextStartAt
        ? formatPublicServiceStart(service.nextStartAt, nowMs)
        : undefined
      return { serviceNumber, timings: null, status: service.status, ...(startMessage && { startMessage }) }
    }
    const timings = service.arrivals
      .map(({ estimatedAt }) => Math.max(0, (Date.parse(estimatedAt) - nowMs) / 1_000))
      .filter((seconds) => seconds >= 0)
      .slice(0, 3)
      .map((seconds) => formatArrivalSeconds(seconds, minuteFormat))
    return timings.length > 0
      ? {
        serviceNumber,
        timings: [timings[0], timings[1] ?? '-', timings[2] ?? '-'] as const,
        status: 'live' as const,
      }
      : { serviceNumber, timings: null, status: 'no-estimate' as const }
  })
}

const SINGAPORE_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })
const SINGAPORE_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', weekday: 'long' })

function singaporeDayNumber(ms: number): number {
  return Date.parse(`${SINGAPORE_DAY_FORMATTER.format(ms)}T00:00:00Z`) / 86_400_000
}

function formatSingaporeClock(ms: number): string {
  const minutes = Math.floor(((ms + 8 * 3_600_000) % 86_400_000) / 60_000)
  const hour = Math.floor(minutes / 60)
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatPublicServiceStart(nextStartAt: string, nowMs: number): string | undefined {
  const startMs = Date.parse(nextStartAt)
  if (!Number.isFinite(startMs)) return undefined
  const daysAway = singaporeDayNumber(startMs) - singaporeDayNumber(nowMs)
  const clock = formatSingaporeClock(startMs)
  if (daysAway <= 0) return `Starts ${clock}`
  if (daysAway === 1) return `Starts tomorrow ${clock}`
  return `Starts ${SINGAPORE_WEEKDAY_FORMATTER.format(startMs)} at ${clock}`
}

function getLiveStopDepartures(
  stop: TransitStop,
  index: TransitIndex,
  snapshot: ShuttleArrivalSnapshot | null,
  nowMs: number,
  liveRouteIds: ReadonlySet<string>,
  minuteFormat: MinuteFormat,
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
      .map((seconds) => formatArrivalSeconds(seconds, minuteFormat))
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
  if (getArrivalAgeMs(snapshot, stopId, nowMs) > SHUTTLE_ARRIVAL_MAX_AGE_MS) return LIVE_TIMES_UNAVAILABLE_MESSAGE
  if (departures.length > 0) return null
  return 'No buses due soon'
}

function compactStartLabel(label: string): string {
  return label.replace(/^today at /, '').replace(/^tomorrow at /, 'tomorrow ')
}

function getRouteAvailability(
  stop: TransitStop,
  index: TransitIndex,
  serviceWindows: StopsServiceWindows | null,
  nowMs: number,
  minuteFormat: MinuteFormat,
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
      ? `First bus in ${formatMinutes(Math.max(1, Math.ceil(nextStart.minutesUntil)), minuteFormat)}`
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
    minuteFormat = DEFAULT_MINUTE_FORMAT,
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
  // An unavailable stop shows the explicit label, not live or timetable times.
  const shuttleUnavailable = arrivalSnapshot?.unavailableStopIds?.includes(stop.id) ?? false
  const routeAvailability = getRouteAvailability(stop, index, serviceWindows, nowMs, minuteFormat)
  const departures = shuttleUnavailable ? [] : getLiveStopDepartures(
    stop,
    index,
    arrivalSnapshot,
    nowMs,
    routeAvailability.liveRouteIds,
    minuteFormat,
  ).map((departure) => ({
    ...departure,
    reachableFavouriteStops: getReachableFavoriteStops(index, departure.routeId, stop.id, favorites)
      .map(({ id, shortName }) => ({
        id,
        name: shortName,
        isOpposite: stop.opposite === id,
      })),
  }))
  const scheduledDepartures = shuttleUnavailable ? [] : routeAvailability.scheduledDepartures
  const publicServices = getPublicServiceTimings(stop, publicArrivalSnapshot, nowMs, minuteFormat)
  const live = (
    !shuttleUnavailable && !isRefreshing && departures.length > 0 && arrivalSnapshot !== null &&
    getArrivalAgeMs(arrivalSnapshot, stop.id, nowMs) <= SHUTTLE_ARRIVAL_FRESHNESS_MS
  ) || (
    !isRefreshing && !publicIsRefreshing &&
    publicServices.some(({ timings, status }) => timings !== null && status === 'live') &&
    publicArrivalSnapshot !== null &&
    getPublicArrivalAgeMs(publicArrivalSnapshot, stop.id, nowMs) <= PUBLIC_BUS_ARRIVAL_FRESHNESS_MS
  )
  const liveArrivalMessage = shuttleUnavailable
    ? LIVE_TIMES_UNAVAILABLE_MESSAGE
    : getLiveArrivalMessage(
      arrivalSnapshot,
      stop.id,
      nowMs,
      departures,
      scheduledDepartures,
      isRefreshing,
      publicArrivalSnapshot,
    )

  return {
    publicServices,
    departures,
    scheduledDepartures,
    live,
    liveArrivalMessage,
  }
}

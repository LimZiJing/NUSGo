import type { ShuttleArrivalSnapshot, ShuttleRouteArrivalData } from '../../src/domain/transit/arrivals.js'
import type { ShuttleServiceWindow } from '../../src/domain/transit/service-hours.js'
import type { ShuttleTimingRecord } from '@nusgo/shared/transit/timing'
import type { PathfindingBenchmarkTimingProfile } from './manifest.js'

export interface BenchmarkRouteStops {
  readonly id: string
  readonly stopIds: readonly string[]
}

export function createBenchmarkArrivalSnapshot(
  profile: PathfindingBenchmarkTimingProfile,
  routes: readonly BenchmarkRouteStops[],
  arrivalRouteIds: readonly string[] | undefined,
  nowMs: number,
): ShuttleArrivalSnapshot {
  const observedAt = new Date(nowMs - profile.observedAgeSeconds * 1000).toISOString()
  const expiresAt = new Date(nowMs + profile.expiresInSeconds * 1000).toISOString()
  const allowedRouteIds = new Set(arrivalRouteIds ?? routes.map(({ id }) => id))
  const stops: Record<string, Record<string, ShuttleRouteArrivalData>> = {}

  if (profile.arrivals !== 'missing') {
    for (const route of routes) {
      if (!allowedRouteIds.has(route.id)) continue
      for (const stopId of route.stopIds) {
        stops[stopId] ??= {}
        stops[stopId][route.id] = {
          nextArrivalSeconds: profile.arrivalSeconds ?? 0,
          upcomingArrivalSeconds: profile.arrivalSeconds === null ? [] : [profile.arrivalSeconds],
          headwaySeconds: profile.headwayMedianSeconds === null
            ? null
            : {
              min: profile.headwayMedianSeconds,
              median: profile.headwayMedianSeconds,
              max: profile.headwayMedianSeconds,
            },
        }
      }
    }
  }

  return {
    observedAt,
    expiresAt,
    snapshotVersion: `${observedAt}-1`,
    stops,
  }
}

export function applyBenchmarkShuttleTimingProfile(
  records: readonly ShuttleTimingRecord[],
  profile: PathfindingBenchmarkTimingProfile,
  arrivalRouteIds: readonly string[] | undefined,
): readonly ShuttleTimingRecord[] {
  if (profile.shuttleTiming === 'canonical') return records
  const scopedRouteIds = new Set(arrivalRouteIds)
  return records.map((record) => {
    if (arrivalRouteIds && !scopedRouteIds.has(record.routeId)) return record
    if (profile.shuttleTiming === 'unavailable') {
      return {
        ...record,
        status: 'unavailable',
        rideSeconds: null,
        rideSecondsLowerBound: null,
        rideSecondsUpperBound: null,
        unavailableReason: 'Benchmark profile disables shuttle ride timing.',
      }
    }
    const rideSeconds = profile.shuttleRideSecondsOverride
    if (rideSeconds === null) return record
    return {
      ...record,
      status: 'estimated',
      rideSeconds,
      rideSecondsLowerBound: rideSeconds,
      rideSecondsUpperBound: rideSeconds,
      unavailableReason: null,
    }
  })
}

export function createBenchmarkServiceWindows(
  profile: PathfindingBenchmarkTimingProfile,
  nowMs: number,
): (routeIds: readonly string[]) => Readonly<Record<string, readonly ShuttleServiceWindow[]>> {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs))
  const serviceWindow = {
    firstTime: profile.service === 'before-start' ? '09:00' : '00:00',
    lastTime: profile.service === 'after-end' ? '07:59' : '23:59',
    dayType: 'Mon-Fri',
    dates: [date],
  }
  return (routeIds) => Object.fromEntries(
    routeIds.map((routeId) => [routeId, [{ ...serviceWindow, routeId }]]),
  )
}

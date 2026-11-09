import type { LocationTracker } from '../../app/contracts/location'
import type { DeviceLocationFix, LocationTrackingState } from '../../domain/location/types'
import { INITIAL_LOCATION_TRACKING_STATE } from '../../domain/location/types'
import { getDistanceMeters } from '../../domain/location/coordinates'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'

export type RouteFollowingDemoLocationMode = 'tracking' | 'inaccurate' | 'stale' | 'denied' | 'disabled'

export interface RouteFollowingDemoSnapshot {
  readonly active: boolean
  readonly now: number
  readonly location: LocationTrackingState | null
  readonly arrivalRevision: number
  readonly driving: boolean
}

interface SimulatedArrival {
  readonly routeId: string
  readonly stopId: string
  readonly etaSeconds: number | null
  readonly observedAt: number
}

interface RideSimulation {
  readonly stops: readonly TransitStop[]
  segmentIndex: number
  segmentProgressMeters: number
  speedMetersPerSecond: number
  lastTickAt: number
  dwellUntil: number | null
}

const SIMULATED_FIX_ACCURACY_METERS = 5
const SIMULATED_POOR_ACCURACY_METERS = 40
const SIMULATED_STALE_FIX_AGE_MS = 31_000
const RIDE_UPDATE_INTERVAL_MS = 250
const STOP_DWELL_MS = 1_000

function createIsoTime(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function createFix(
  longitude: number,
  latitude: number,
  accuracy: number,
  timestamp: number,
): DeviceLocationFix {
  return { longitude, latitude, accuracy, timestamp }
}

function getOffsetCoordinate(stop: TransitStop, offsetMeters: number): { longitude: number; latitude: number } {
  const longitudeScale = 111_320 * Math.max(0.01, Math.cos(stop.latitude * Math.PI / 180))
  return {
    longitude: stop.longitude + offsetMeters / longitudeScale,
    latitude: stop.latitude,
  }
}

export class RouteFollowingDemoController {
  private snapshot: RouteFollowingDemoSnapshot = {
    active: false,
    now: Date.now(),
    location: null,
    arrivalRevision: 0,
    driving: false,
  }

  private arrival: SimulatedArrival | null = null
  private ride: RideSimulation | null = null
  private rideTimer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly locationListeners = new Set<() => void>()

  getSnapshot = (): RouteFollowingDemoSnapshot => this.snapshot

  getLocationOverride = (): LocationTrackingState | null => (
    this.snapshot.active ? this.snapshot.location ?? INITIAL_LOCATION_TRACKING_STATE : null
  )

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeLocation = (listener: () => void): (() => void) => {
    this.locationListeners.add(listener)
    return () => this.locationListeners.delete(listener)
  }

  activate(): void {
    if (this.snapshot.active) return
    this.snapshot = {
      ...this.snapshot,
      active: true,
      now: Date.now(),
      location: INITIAL_LOCATION_TRACKING_STATE,
    }
    this.publish(true)
  }

  reset(): void {
    this.stopRideTimer()
    this.arrival = null
    this.ride = null
    this.snapshot = {
      active: false,
      now: Date.now(),
      location: null,
      arrivalRevision: this.snapshot.arrivalRevision + 1,
      driving: false,
    }
    this.publish(true)
  }

  setLocation(
    mode: RouteFollowingDemoLocationMode,
    stop: TransitStop,
    offsetMeters = 0,
  ): void {
    const coordinate = getOffsetCoordinate(stop, offsetMeters)
    this.setLocationAtCoordinate(mode, coordinate.longitude, coordinate.latitude)
  }

  setLocationAtCoordinate(
    mode: RouteFollowingDemoLocationMode,
    longitude: number,
    latitude: number,
  ): void {
    if (this.ride || this.rideTimer !== null) this.pauseDriving()
    this.activate()
    const now = this.snapshot.now
    if (mode === 'denied' || mode === 'disabled') {
      this.stopRideTimer()
      this.snapshot = {
        ...this.snapshot,
        location: { status: mode, latestFix: null },
        driving: false,
      }
      this.ride = null
      this.publish(true)
      return
    }

    const isStale = mode === 'stale'
    const accuracy = mode === 'inaccurate'
      ? SIMULATED_POOR_ACCURACY_METERS
      : SIMULATED_FIX_ACCURACY_METERS
    const fix = createFix(
      longitude,
      latitude,
      accuracy,
      now - (isStale ? SIMULATED_STALE_FIX_AGE_MS : 0),
    )
    this.snapshot = {
      ...this.snapshot,
      location: { status: isStale ? 'stale' : 'tracking', latestFix: fix },
    }
    this.publish(true)
  }

  setArrival(route: BusRoute, stop: TransitStop, etaSeconds: number | null): void {
    this.setArrivalForService(route.id, stop, etaSeconds)
  }

  setPublicServiceArrival(serviceId: string, stop: TransitStop, etaSeconds: number | null): void {
    this.setArrivalForService(`PUBLIC-${serviceId}`, stop, etaSeconds)
  }

  private setArrivalForService(serviceId: string, stop: TransitStop, etaSeconds: number | null): void {
    this.activate()
    this.arrival = etaSeconds === null
      ? null
      : { routeId: serviceId, stopId: stop.id, etaSeconds, observedAt: this.snapshot.now }
    this.snapshot = {
      ...this.snapshot,
      arrivalRevision: this.snapshot.arrivalRevision + 1,
    }
    this.publish()
  }

  advanceTime(milliseconds: number): void {
    if (!this.snapshot.active || !Number.isFinite(milliseconds) || milliseconds <= 0) return
    const now = this.snapshot.now + milliseconds
    const location = this.snapshot.location
    this.snapshot = {
      ...this.snapshot,
      now,
      ...(location?.latestFix
        ? {
          location: {
            ...location,
            latestFix: { ...location.latestFix, timestamp: location.latestFix.timestamp + milliseconds },
          },
        }
        : {}),
    }
    this.publish(Boolean(location?.latestFix))
  }

  loadArrivals = async (
    stops: readonly { readonly stopId: string; readonly stopName: string }[],
    signal: AbortSignal,
  ): Promise<ShuttleArrivalSnapshot> => {
    if (signal.aborted) throw new DOMException('The request was aborted', 'AbortError')

    const now = this.snapshot.now
    const observedAt = createIsoTime(this.arrival?.observedAt ?? now)
    const arrival = this.arrival
    const stopIncluded = arrival !== null && stops.some(({ stopId }) => stopId === arrival.stopId)
    const routeArrival = stopIncluded && arrival?.etaSeconds !== null && arrival
      ? {
        [arrival.routeId]: {
          nextArrivalSeconds: arrival.etaSeconds,
          upcomingArrivalSeconds: [arrival.etaSeconds],
          headwaySeconds: null,
        },
      }
      : undefined

    return {
      observedAt,
      expiresAt: createIsoTime((this.arrival?.observedAt ?? now) + 120_000),
      stops: routeArrival && arrival ? { [arrival.stopId]: routeArrival } : {},
    }
  }

  startDriving(stops: readonly TransitStop[], startIndex: number, speedMetersPerSecond: number): void {
    if (stops.length < 2 || startIndex < 0 || startIndex >= stops.length - 1) return
    this.activate()
    this.stopRideTimer()

    const startStop = stops[startIndex]
    if (!startStop) return
    const location = this.snapshot.location
    if (location?.status !== 'tracking' || !location.latestFix) {
      this.setLocationAtCoordinate('tracking', startStop.longitude, startStop.latitude)
    }

    this.ride = {
      stops,
      segmentIndex: startIndex,
      segmentProgressMeters: 0,
      speedMetersPerSecond: Math.max(1, speedMetersPerSecond),
      lastTickAt: Date.now(),
      dwellUntil: null,
    }
    this.snapshot = { ...this.snapshot, driving: true }
    this.publish()
    this.rideTimer = setInterval(() => this.tickRide(), RIDE_UPDATE_INTERVAL_MS)
  }

  pauseDriving(): void {
    if (!this.ride && this.rideTimer === null) return
    this.stopRideTimer()
    this.ride = null
    this.snapshot = { ...this.snapshot, driving: false }
    this.publish()
  }

  private tickRide(): void {
    const ride = this.ride
    if (!ride) return
    const realNow = Date.now()
    const elapsedMs = Math.max(0, Math.min(realNow - ride.lastTickAt, RIDE_UPDATE_INTERVAL_MS))
    if (elapsedMs === 0) return
    ride.lastTickAt = realNow

    const now = this.snapshot.now + elapsedMs
    const startStop = ride.stops[ride.segmentIndex]
    const endStop = ride.stops[ride.segmentIndex + 1]
    if (!startStop || !endStop) {
      this.finishRide(now)
      return
    }

    if (ride.dwellUntil !== null) {
      if (now >= ride.dwellUntil) {
        ride.segmentIndex += 1
        ride.segmentProgressMeters = 0
        ride.dwellUntil = null
        if (ride.segmentIndex >= ride.stops.length - 1) {
          this.finishRide(now, endStop)
          return
        }
      }
      this.publishRideFix(endStop.longitude, endStop.latitude, now)
      return
    }

    const segmentLength = getDistanceMeters(
      { longitude: startStop.longitude, latitude: startStop.latitude },
      { longitude: endStop.longitude, latitude: endStop.latitude },
    )
    ride.segmentProgressMeters += ride.speedMetersPerSecond * elapsedMs / 1_000
    if (segmentLength <= 1 || ride.segmentProgressMeters >= segmentLength) {
      ride.dwellUntil = now + STOP_DWELL_MS
      this.publishRideFix(endStop.longitude, endStop.latitude, now)
      return
    }

    const progress = ride.segmentProgressMeters / segmentLength
    this.publishRideFix(
      startStop.longitude + (endStop.longitude - startStop.longitude) * progress,
      startStop.latitude + (endStop.latitude - startStop.latitude) * progress,
      now,
    )
  }

  private publishRideFix(longitude: number, latitude: number, now: number): void {
    this.snapshot = {
      ...this.snapshot,
      now,
      location: {
        status: 'tracking',
        latestFix: createFix(longitude, latitude, SIMULATED_FIX_ACCURACY_METERS, now),
      },
    }
    this.publish(true)
  }

  private finishRide(now: number, stop?: TransitStop): void {
    this.stopRideTimer()
    this.ride = null
    this.snapshot = {
      ...this.snapshot,
      now,
      driving: false,
      ...(stop
        ? {
          location: {
            status: 'tracking' as const,
            latestFix: createFix(stop.longitude, stop.latitude, SIMULATED_FIX_ACCURACY_METERS, now),
          },
        }
        : {}),
    }
    this.publish(Boolean(stop))
  }

  private stopRideTimer(): void {
    if (this.rideTimer === null) return
    clearInterval(this.rideTimer)
    this.rideTimer = null
  }

  private publish(locationChanged = false): void {
    for (const listener of [...this.listeners]) listener()
    if (locationChanged) {
      for (const listener of [...this.locationListeners]) listener()
    }
  }
}

export function createRouteFollowingDemoLocationTracker(
  browserTracker: LocationTracker,
  demo: RouteFollowingDemoController,
): LocationTracker {
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const unsubscribeBrowser = browserTracker.subscribe(notify)
  const unsubscribeDemo = demo.subscribeLocation(notify)

  return {
    getState() {
      return demo.getLocationOverride() ?? browserTracker.getState()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    enable() {
      browserTracker.enable()
    },
    disable() {
      browserTracker.disable()
    },
    dispose() {
      unsubscribeBrowser()
      unsubscribeDemo()
      listeners.clear()
      browserTracker.dispose()
      demo.pauseDriving()
    },
  }
}

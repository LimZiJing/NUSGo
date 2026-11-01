import type { DataFreshness, ShuttleArrivalSnapshot, ShuttleLoadLevel } from '../transit/live-arrivals.ts'
import type { PublicBusArrivalSnapshot } from '../transit/public-bus-arrivals.ts'
import type { ShuttleServiceWindow } from '../transit/service-hours.ts'

export interface ApiStopSelection {
  readonly stopId: string
}

export interface ApiShuttleArrivalsRequest {
  readonly stops: readonly ApiStopSelection[]
}

export interface ApiPublicBusArrivalsRequest {
  readonly stops: readonly ApiStopSelection[]
}

export interface ApiShuttleServiceWindowsRequest {
  readonly routes: readonly string[]
}

export interface ApiRequestOptions {
  readonly signal?: AbortSignal
}

export type ApiShuttleArrivalsResponse = ShuttleArrivalSnapshot
export type ApiPublicBusArrivalsResponse = PublicBusArrivalSnapshot

export interface ApiShuttleServiceWindowsResponse extends DataFreshness {
  readonly routes: Readonly<Record<string, readonly ShuttleServiceWindow[]>>
}

export interface ShuttleVehiclePosition {
  readonly routeId: string
  readonly plate: string
  readonly lat: number
  readonly lng: number
  /** Compass degrees, 0 to 360. */
  readonly headingDegrees: number
  /** Speed as reported by NUS; the unit is unconfirmed. */
  readonly speed: number
  readonly load: ShuttleLoadLevel
  readonly observedAt: string
  readonly expiresAt: string
}

export interface ApiShuttleVehiclesRequest {
  readonly routes: readonly string[]
}

export interface ApiShuttleVehiclesResponse extends DataFreshness {
  readonly vehicles: readonly ShuttleVehiclePosition[]
  /** Requested routes with no fresh result, so clients do not read them as having no buses. */
  readonly unavailableRouteIds?: readonly string[]
}

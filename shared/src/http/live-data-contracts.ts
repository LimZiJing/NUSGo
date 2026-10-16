import type { DataFreshness, ShuttleArrivalSnapshot } from '../transit/live-arrivals.ts'
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

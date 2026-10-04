import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals.js'

export interface ShuttleArrivalStopRequest {
  readonly stopId: string
  readonly stopName: string
}

export interface ShuttleArrivalClient {
  getArrivals(
    stops: readonly ShuttleArrivalStopRequest[],
    signal: AbortSignal,
  ): Promise<ShuttleArrivalSnapshot>
}

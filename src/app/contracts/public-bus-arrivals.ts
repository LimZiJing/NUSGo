import type { PublicBusArrivalSnapshot } from '../../domain/transit/public-bus-arrivals.js'

export interface PublicBusArrivalStopRequest {
  readonly stopId: string
  readonly stopName: string
}

export interface PublicBusArrivalClient {
  getArrivals(
    stops: readonly PublicBusArrivalStopRequest[],
    signal: AbortSignal,
  ): Promise<PublicBusArrivalSnapshot>
}

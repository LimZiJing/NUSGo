import type { DataFreshness } from './live-arrivals.ts'

export type PublicBusServiceArrivalStatus =
  | 'live'
  | 'no-estimate'
  | 'not-in-operation'
  | 'provider-error'

export interface PublicBusEstimatedArrival {
  readonly estimatedAt: string
  readonly monitored: boolean
}

export interface PublicBusServiceArrival {
  readonly status: PublicBusServiceArrivalStatus
  readonly arrivals: readonly PublicBusEstimatedArrival[]
}

export interface PublicBusStopArrivalData extends DataFreshness {
  readonly services: Readonly<Record<string, PublicBusServiceArrival>>
}

export interface PublicBusArrivalSnapshot extends DataFreshness {
  readonly source: 'lta-datamall'
  readonly refreshedAt: string
  readonly stops: Readonly<Record<string, PublicBusStopArrivalData>>
}

export const PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS = 30_000
export const PUBLIC_BUS_ARRIVAL_FRESHNESS_MS = 30_000
export const PUBLIC_BUS_ARRIVAL_MAX_AGE_MS = 120_000

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

export interface PublicBusStopArrivalData {
  readonly observedAt: string
  readonly expiresAt: string
  readonly services: Readonly<Record<string, PublicBusServiceArrival>>
}

export interface PublicBusArrivalSnapshot {
  readonly source: 'lta-datamall'
  readonly observedAt: string
  readonly expiresAt: string
  readonly refreshedAt: string
  readonly stops: Readonly<Record<string, PublicBusStopArrivalData>>
}

export const PUBLIC_BUS_ARRIVAL_REFRESH_INTERVAL_MS = 30_000
export const PUBLIC_BUS_ARRIVAL_FRESHNESS_MS = 30_000
export const PUBLIC_BUS_ARRIVAL_MAX_AGE_MS = 120_000

export function isOlderPublicBusArrivalSnapshot(
  candidate: PublicBusArrivalSnapshot,
  current: PublicBusArrivalSnapshot,
): boolean {
  return Date.parse(candidate.refreshedAt) < Date.parse(current.refreshedAt)
}

export interface ShuttleHeadwaySeconds {
  readonly min: number
  readonly max: number
  readonly median: number
}

export interface ShuttleRouteArrivalData {
  readonly nextArrivalSeconds: number
  readonly upcomingArrivalSeconds: readonly number[]
  readonly headwaySeconds: ShuttleHeadwaySeconds | null
}

export interface ShuttleArrivalSnapshot {
  readonly observedAt: string
  readonly expiresAt: string
  readonly stops: Readonly<Record<string, Readonly<Record<string, ShuttleRouteArrivalData>>>>
  readonly stopObservations?: Readonly<Record<string, ShuttleArrivalObservation>>
}

export interface ShuttleArrivalObservation {
  readonly observedAt: string
  readonly expiresAt: string
}

export const SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS = 30_000
export const SHUTTLE_ARRIVAL_FRESHNESS_MS = 30_000

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
}

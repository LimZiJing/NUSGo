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
  readonly snapshotVersion?: string
  readonly refreshedAt?: string
  readonly nextRefreshAt?: string
  readonly stops: Readonly<Record<string, Readonly<Record<string, ShuttleRouteArrivalData>>>>
  readonly stopObservations?: Readonly<Record<string, ShuttleArrivalObservation>>
}

export interface ShuttleArrivalObservation {
  readonly observedAt: string
  readonly expiresAt: string
}

export const SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS = 30_000
export const SHUTTLE_ARRIVAL_FRESHNESS_MS = 30_000
export const SHUTTLE_ARRIVAL_MAX_AGE_MS = 120_000

function parseSnapshotVersion(version: string): { readonly timestampMs: number; readonly generation: number } | null {
  const match = version.match(/^(.*)-(\d+)$/)
  if (!match) return null
  const timestampMs = Date.parse(match[1])
  const generation = Number(match[2])
  if (!Number.isFinite(timestampMs) || !Number.isSafeInteger(generation)) return null
  return { timestampMs, generation }
}

export function isOlderShuttleArrivalSnapshot(
  candidate: ShuttleArrivalSnapshot,
  current: ShuttleArrivalSnapshot,
): boolean {
  if (candidate.snapshotVersion && current.snapshotVersion) {
    const candidateVersion = parseSnapshotVersion(candidate.snapshotVersion)
    const currentVersion = parseSnapshotVersion(current.snapshotVersion)
    if (candidateVersion && currentVersion) {
      return candidateVersion.timestampMs < currentVersion.timestampMs ||
        (candidateVersion.timestampMs === currentVersion.timestampMs &&
          candidateVersion.generation < currentVersion.generation)
    }
    return candidate.snapshotVersion < current.snapshotVersion
  }
  const candidateTime = Date.parse(candidate.refreshedAt ?? candidate.observedAt)
  const currentTime = Date.parse(current.refreshedAt ?? current.observedAt)
  return candidateTime < currentTime
}

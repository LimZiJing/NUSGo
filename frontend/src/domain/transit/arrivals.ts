import type { ShuttleArrivalSnapshot } from '@nusgo/shared'

export type {
  DataFreshness,
  ShuttleArrivalObservation,
  ShuttleHeadwaySeconds,
  ShuttleRouteArrivalData,
  ShuttleArrivalSnapshot,
} from '@nusgo/shared'
export {
  SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS,
  SHUTTLE_ARRIVAL_FRESHNESS_MS,
  SHUTTLE_ARRIVAL_MAX_AGE_MS,
} from '@nusgo/shared'

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

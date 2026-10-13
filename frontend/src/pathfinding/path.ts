import type { TripCoordinate, TripEndpoint } from '../domain/trip/types'

export interface PathGeometry {
  readonly type: 'LineString'
  readonly coordinates: readonly (readonly [number, number])[]
}

/** One ordered travel-mode segment; its geometry is kept with the segment for map rendering. */
interface PathLegBase {
  readonly from: TripEndpoint
  readonly to: TripEndpoint
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly geometry: PathGeometry
}

export interface WalkingPathLeg extends PathLegBase {
  readonly mode: 'walking'
}

export interface BusPathLeg extends PathLegBase {
  readonly mode: 'shuttle'
  readonly routeId: string
  readonly boardingStopId: string
  readonly alightingStopId: string
  readonly waitingSeconds: number
  readonly rideSeconds: number
}

export type PathLeg = WalkingPathLeg | BusPathLeg

export type PathQuality = 'exact' | 'bounded'

/** One complete option between the selected endpoints, with ordered walking and bus legs. */
export interface Path {
  readonly origin: TripEndpoint
  readonly destination: TripEndpoint
  readonly legs: readonly PathLeg[]
  readonly totalDurationSeconds: number
  readonly totalDistanceMeters: number
  readonly estimateStatus: 'estimated'
  readonly planningQuality: PathQuality
}

/** A candidate Path paired with its core-search score for ranking and Plan selection. */
export interface ScoredPathCandidate {
  readonly candidateKey: string
  readonly path: Path
  readonly adjustedDurationSeconds: number
  readonly score: number
}

export interface PathEndpointLocation {
  readonly endpoint: TripEndpoint
  readonly coordinate: TripCoordinate
}

import type { TripCoordinate, TripEndpoint } from './types'

export interface JourneyLineString {
  readonly type: 'LineString'
  readonly coordinates: readonly (readonly [number, number])[]
}

interface JourneyLegBase {
  readonly from: TripEndpoint
  readonly to: TripEndpoint
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly geometry: JourneyLineString
}

export interface WalkingJourneyLeg extends JourneyLegBase {
  readonly mode: 'walking'
}

export interface ShuttleJourneyLeg extends JourneyLegBase {
  readonly mode: 'shuttle'
  readonly routeId: string
  readonly boardingStopId: string
  readonly alightingStopId: string
  readonly waitingSeconds: number
  readonly rideSeconds: number
}

export type JourneyLeg = WalkingJourneyLeg | ShuttleJourneyLeg

export interface Journey {
  readonly origin: TripEndpoint
  readonly destination: TripEndpoint
  readonly legs: readonly JourneyLeg[]
  readonly totalDurationSeconds: number
  readonly totalDistanceMeters: number
  readonly estimateStatus: 'estimated'
}

export interface JourneyEndpointLocation {
  readonly endpoint: TripEndpoint
  readonly coordinate: TripCoordinate
}

export interface RoutingCoordinate {
  readonly longitude: number
  readonly latitude: number
}

export interface WalkingRouteRequest {
  readonly origin: RoutingCoordinate
  readonly destination: RoutingCoordinate
}

export interface WalkingRoute {
  readonly distanceMeters: number
  readonly durationSeconds: number
  readonly geometry: {
    readonly type: 'LineString'
    readonly coordinates: readonly (readonly [number, number])[]
  }
}

export interface WalkingMatrixRequest {
  readonly sources: readonly RoutingCoordinate[]
  readonly targets: readonly RoutingCoordinate[]
}

export interface WalkingMatrixConnection {
  readonly fromIndex: number
  readonly toIndex: number
  readonly distanceMeters: number
  readonly durationSeconds: number
}

export interface WalkingRouteEngine {
  routeWalking(
    request: WalkingRouteRequest,
    signal: AbortSignal,
  ): Promise<WalkingRoute>
  matrixWalking(
    request: WalkingMatrixRequest,
    signal: AbortSignal,
  ): Promise<readonly WalkingMatrixConnection[]>
}

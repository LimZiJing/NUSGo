export interface ApiHealthResponse {
  readonly status: 'ok'
  readonly dataVersion: string
}

export interface ApiReadyResponse {
  readonly status: 'ready'
  readonly dataVersion: string
  readonly venueCount: number
  readonly routeCount: number
  readonly stopCount: number
  readonly walkingConnectionCount: number
}

export interface ApiErrorResponse {
  readonly error: string
}

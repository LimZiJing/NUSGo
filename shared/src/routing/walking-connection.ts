export interface WalkingConnection {
  readonly fromKey: string
  readonly toKey: string
  readonly distanceMeters: number
  readonly durationSeconds: number
}

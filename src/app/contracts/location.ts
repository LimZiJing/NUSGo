import type { LocationTrackingState } from '../../domain/location/types'

export interface LocationTracker {
  getState(): LocationTrackingState
  subscribe(listener: () => void): () => void
  enable(): void
  disable(): void
  dispose(): void
}

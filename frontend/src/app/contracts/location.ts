import type { DeviceLocationFix, LocationTrackingState } from '../../domain/location/types'

export interface LocationTracker {
  getState(): LocationTrackingState
  subscribe(listener: () => void): () => void
  requestCurrentLocation?: () => Promise<DeviceLocationFix>
  enable(): void
  disable(): void
  dispose(): void
}

export type LocationTrackingStatus =
  | 'disabled'
  | 'requesting'
  | 'tracking'
  | 'stale'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'invalid'

export interface DeviceLocationFix {
  readonly longitude: number
  readonly latitude: number
  readonly accuracy: number
  readonly timestamp: number
}

export interface LocationTrackingState {
  readonly status: LocationTrackingStatus
  readonly latestFix: DeviceLocationFix | null
}

export const INITIAL_LOCATION_TRACKING_STATE: LocationTrackingState = Object.freeze({
  status: 'disabled',
  latestFix: null,
})

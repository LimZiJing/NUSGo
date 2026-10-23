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

export type LocationRequestFailureStatus = 'denied' | 'unavailable' | 'timeout' | 'invalid'

export type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable'

export interface LocationRequestFailure {
  readonly status: LocationRequestFailureStatus
}

export function isLocationRequestFailure(error: unknown): error is LocationRequestFailure {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown }).status
  return status === 'denied' || status === 'unavailable' || status === 'timeout' || status === 'invalid'
}

export interface LocationTrackingState {
  readonly status: LocationTrackingStatus
  readonly latestFix: DeviceLocationFix | null
}

export const INITIAL_LOCATION_TRACKING_STATE: LocationTrackingState = Object.freeze({
  status: 'disabled',
  latestFix: null,
})

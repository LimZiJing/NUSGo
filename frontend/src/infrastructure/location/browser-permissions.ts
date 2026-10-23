import type { LocationPermissionState } from '../../domain/location/types'

export async function readBrowserLocationPermission(): Promise<LocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unavailable'

  try {
    // Permissions.query reads the browser's current state without opening its location prompt.
    const permission = await navigator.permissions.query({ name: 'geolocation' })
    return permission.state === 'granted' || permission.state === 'denied'
      ? permission.state
      : 'prompt'
  } catch {
    return 'unavailable'
  }
}

import { Marker, type Map } from 'maplibre-gl'
import type { DeviceLocationFix } from '../../domain/location/types'

const CURRENT_LOCATION_PULSE_CLASS = 'current-location-marker-pulsing'
const CURRENT_LOCATION_PULSE_DURATION_MS = 760

export interface CurrentLocationMarker {
  setLocation(fix: DeviceLocationFix | null, visible: boolean): void
  pulse(): void
  dispose(): void
}

function createCurrentLocationMarkerElement(): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'current-location-marker'
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', 'Current location')
  element.style.setProperty('--current-location-pulse-duration', `${CURRENT_LOCATION_PULSE_DURATION_MS}ms`)
  return element
}

export function createCurrentLocationMarker(map: Map): CurrentLocationMarker {
  let marker: Marker | null = null
  let markerAdded = false
  let currentFix: DeviceLocationFix | null = null
  let visible = false
  let disposed = false
  let pulseTimer: ReturnType<typeof setTimeout> | null = null

  const stopPulse = (): void => {
    if (pulseTimer !== null) {
      clearTimeout(pulseTimer)
      pulseTimer = null
    }
    marker?.getElement().classList.remove(CURRENT_LOCATION_PULSE_CLASS)
  }

  const removeMarker = (): void => {
    stopPulse()
    if (!marker || !markerAdded) return
    marker.remove()
    markerAdded = false
  }

  const showMarker = (): void => {
    if (!currentFix || !visible || disposed) return
    if (!marker) {
      marker = new Marker({
        anchor: 'center',
        element: createCurrentLocationMarkerElement(),
      })
    }
    marker.setLngLat([currentFix.longitude, currentFix.latitude])
    if (!markerAdded) {
      marker.addTo(map)
      markerAdded = true
    }
  }

  return {
    setLocation(fix, nextVisible) {
      if (disposed) return
      currentFix = fix
      visible = nextVisible
      if (!currentFix || !visible) {
        removeMarker()
        return
      }
      showMarker()
    },

    pulse() {
      if (disposed || !marker || !markerAdded) return

      stopPulse()
      const element = marker.getElement()
      void element.offsetWidth
      element.classList.add(CURRENT_LOCATION_PULSE_CLASS)
      pulseTimer = setTimeout(() => {
        pulseTimer = null
        element.classList.remove(CURRENT_LOCATION_PULSE_CLASS)
      }, CURRENT_LOCATION_PULSE_DURATION_MS)
    },

    dispose() {
      if (disposed) return
      disposed = true
      removeMarker()
      marker = null
      currentFix = null
    },
  }
}

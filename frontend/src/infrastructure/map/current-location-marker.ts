import { Marker, type Map } from 'maplibre-gl'
import type { DeviceLocationFix } from '../../domain/location/types'

export interface CurrentLocationMarker {
  setLocation(fix: DeviceLocationFix | null, visible: boolean): void
  dispose(): void
}

function createCurrentLocationMarkerElement(): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'current-location-marker'
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', 'Current location')
  return element
}

export function createCurrentLocationMarker(map: Map): CurrentLocationMarker {
  let marker: Marker | null = null
  let markerAdded = false
  let currentFix: DeviceLocationFix | null = null
  let visible = false
  let disposed = false

  const removeMarker = (): void => {
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

    dispose() {
      if (disposed) return
      disposed = true
      removeMarker()
      marker = null
      currentFix = null
    },
  }
}

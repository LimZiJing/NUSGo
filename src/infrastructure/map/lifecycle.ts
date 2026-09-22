import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { MapSessionOptions } from '../../app/contracts/map'
import {
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
} from './transit'
import {
  JOURNEY_ROUTE_CASING_LAYER_ID,
  JOURNEY_SHUTTLE_LAYER_ID,
  JOURNEY_WALKING_LAYER_ID,
} from './journey'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(maplibreWorkerUrl)

const KENT_RIDGE_LOCATION: [number, number] = [103.7844, 1.2933]
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export interface MapLifecycle {
  readonly map: Map
  readonly ready: Promise<void>
  dispose(): void
}

export function waitForMapStyleLoaded(
  map: Map,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The map style load was aborted', 'AbortError'))
  }
  if (map.isStyleLoaded()) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      map.off('load', handleLoad)
      signal.removeEventListener('abort', handleAbort)
    }
    const handleLoad = () => {
      cleanup()
      resolve()
    }
    const handleAbort = () => {
      cleanup()
      reject(new DOMException('The map style load was aborted', 'AbortError'))
    }

    map.once('load', handleLoad)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export function createMapLifecycle(options: MapSessionOptions): MapLifecycle {
  const controller = new AbortController()
  const map = new Map({
    container: options.container,
    style: MAP_STYLE,
    center: KENT_RIDGE_LOCATION,
    zoom: 15,
  })
  const navigationControl = new NavigationControl()
  let disposed = false

  const handleMapError = (event: { error?: unknown }) => {
    if (!disposed) options.onMapError(event.error)
  }

  const handleMapClick = (event: MapMouseEvent) => {
    if (disposed) return
    options.onMapInteraction?.()

    // Only an empty map click dismisses venue detail. Marker, popup, control,
    // and route-line clicks belong to their own interactions.
    const eventTarget = event.originalEvent.target
    if (eventTarget instanceof Element && eventTarget.closest(
      '.maplibregl-marker, .maplibregl-popup, .maplibregl-control, .maplibregl-ctrl, .map-controls',
    )) return

    const routeLayerIds = [
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      JOURNEY_ROUTE_CASING_LAYER_ID,
      JOURNEY_WALKING_LAYER_ID,
      JOURNEY_SHUTTLE_LAYER_ID,
    ].filter((layerId) => map.getLayer(layerId))
    if (routeLayerIds.length > 0 && map.queryRenderedFeatures(
      event.point,
      { layers: routeLayerIds },
    ).length) return

    options.onEmptyMapClick()
  }

  map.addControl(navigationControl, 'top-right')
  map.on('error', handleMapError)
  map.on('click', handleMapClick)

  const ready = waitForMapStyleLoaded(map, controller.signal)

  return {
    map,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      map.off('error', handleMapError)
      map.off('click', handleMapClick)
      map.removeControl(navigationControl)
      map.remove()
    },
  }
}

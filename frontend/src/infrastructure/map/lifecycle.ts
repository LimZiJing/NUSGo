import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { MapSessionOptions, MapViewportInsets } from '../../app/contracts/map'
import {
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
} from './transit'
import {
  JOURNEY_ALTERNATIVE_CASING_LAYER_ID,
  JOURNEY_ALTERNATIVE_SHUTTLE_LAYER_ID,
  JOURNEY_ALTERNATIVE_WALKING_LAYER_ID,
  JOURNEY_SELECTED_CASING_LAYER_ID,
  JOURNEY_SELECTED_DIRECTION_LAYER_ID,
  JOURNEY_SELECTED_SHUTTLE_LAYER_ID,
  JOURNEY_SELECTED_WALKING_LAYER_ID,
} from './path-layers'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(maplibreWorkerUrl)

const KENT_RIDGE_LOCATION: [number, number] = [103.7844, 1.2933]
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

class NusgoAttributionControl {
  private container: HTMLElement | null = null

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl nusgo-map-attribution'
    container.innerHTML = '<a href="https://openmaptiles.org/">© OpenMapTiles</a> · '
      + '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    this.container = container
    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = null
  }
}

export interface MapLifecycle {
  readonly map: Map
  readonly ready: Promise<void>
  setViewportInsets(insets: MapViewportInsets): void
  /** While on, zoom keeps the visible-area centre (where the crosshair sits) fixed. */
  setVisibleCenterZoom(enabled: boolean): void
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
    attributionControl: false,
  })
  const navigationControl = new NavigationControl()
  const attributionControl = new NusgoAttributionControl()
  let disposed = false
  let viewportInsets: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  let visibleCenterZoom = false

  const handleMapError = (event: { error?: unknown }) => {
    if (!disposed) options.onMapError(event.error)
  }

  const reportMapCenter = (): void => {
    if (disposed || !options.onMapCenterChange) return
    const { clientWidth, clientHeight } = map.getContainer()
    // The bottom sheet obscures the canvas centre, so project the usable map area's centre.
    const visibleCenterX = (clientWidth + viewportInsets.left - viewportInsets.right) / 2
    const visibleCenterY = (clientHeight + viewportInsets.top - viewportInsets.bottom) / 2
    const center = clientWidth > 0 && clientHeight > 0
      ? map.unproject([
        Math.max(0, Math.min(clientWidth, visibleCenterX)),
        Math.max(0, Math.min(clientHeight, visibleCenterY)),
      ])
      : map.getCenter()
    options.onMapCenterChange([center.lng, center.lat])
  }

  // Persistent padding makes MapLibre's own centre the visible-area centre, so button
  // and gesture zoom use it. The pan keeps the view still while the padding changes.
  const setPaddingKeepingView = (padding: MapViewportInsets): void => {
    const { clientWidth, clientHeight } = map.getContainer()
    const anchor = map.unproject([clientWidth / 2, clientHeight / 2])
    map.setPadding(padding)
    const moved = map.project(anchor)
    map.panBy([moved.x - clientWidth / 2, moved.y - clientHeight / 2], { animate: false })
  }

  const handleMapClick = (event: MapMouseEvent) => {
    if (disposed) return

    // Only an empty map click dismisses venue detail. Marker, popup, control,
    // and route-line clicks belong to their own interactions.
    const eventTarget = event.originalEvent.target
    if (eventTarget instanceof Element && eventTarget.closest(
      '.maplibregl-marker, .maplibregl-popup, .maplibregl-control, .maplibregl-ctrl, .location-control',
    )) return

    const routeLayerIds = [
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      JOURNEY_ALTERNATIVE_CASING_LAYER_ID,
      JOURNEY_ALTERNATIVE_WALKING_LAYER_ID,
      JOURNEY_ALTERNATIVE_SHUTTLE_LAYER_ID,
      JOURNEY_SELECTED_CASING_LAYER_ID,
      JOURNEY_SELECTED_WALKING_LAYER_ID,
      JOURNEY_SELECTED_SHUTTLE_LAYER_ID,
      JOURNEY_SELECTED_DIRECTION_LAYER_ID,
    ].filter((layerId) => map.getLayer(layerId))
    if (routeLayerIds.length > 0 && map.queryRenderedFeatures(
      event.point,
      { layers: routeLayerIds },
    ).length) return

    options.onEmptyMapClick()
  }

  map.addControl(navigationControl, 'top-right')
  map.addControl(attributionControl, 'bottom-right')
  map.on('error', handleMapError)
  map.on('click', handleMapClick)
  if (options.onMapCenterChange) {
    map.on('moveend', reportMapCenter)
    map.on('resize', reportMapCenter)
    reportMapCenter()
  }

  const ready = waitForMapStyleLoaded(map, controller.signal)

  return {
    map,
    ready,
    setViewportInsets(insets) {
      if (disposed) return
      viewportInsets = insets
      if (visibleCenterZoom) setPaddingKeepingView(insets)
      reportMapCenter()
    },
    setVisibleCenterZoom(enabled) {
      if (disposed || enabled === visibleCenterZoom) return
      visibleCenterZoom = enabled
      setPaddingKeepingView(enabled ? viewportInsets : { top: 0, right: 0, bottom: 0, left: 0 })
      // `around: 'center'` follows the padded centre; plain enable() restores pointer-anchored zoom.
      // enable() ignores new options while already enabled, so the handlers are reset first.
      const zoomOptions = enabled ? { around: 'center' as const } : undefined
      map.scrollZoom.disable()
      map.scrollZoom.enable(zoomOptions)
      map.touchZoomRotate.disable()
      map.touchZoomRotate.enable(zoomOptions)
    },
    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      map.off('error', handleMapError)
      map.off('click', handleMapClick)
      if (options.onMapCenterChange) {
        map.off('moveend', reportMapCenter)
        map.off('resize', reportMapCenter)
      }
      map.removeControl(navigationControl)
      map.removeControl(attributionControl)
      map.remove()
    },
  }
}

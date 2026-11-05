import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
  type MapMouseEvent,
  type MapTouchEvent,
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
const DOUBLE_TAP_MS = 300
const TAP_SLOP_PX = 20
// Match MapLibre's default click tolerance so minor pointer jitter still counts as a tap.
const MARKER_DRAG_SLOP_PX = 3
const DOUBLE_ZOOM_DEBOUNCE_MS = 500
const DOUBLE_ZOOM_DURATION_MS = 300

const STYLE_LOAD_TIMEOUT_MS = 4000
const ATTRIBUTION_DISPLAY_DURATION_MS = 5000
const OFFLINE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

class NusgoAttributionControl {
  private container: HTMLElement | null = null
  private dismissTimeout: ReturnType<typeof setTimeout> | null = null

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl nusgo-map-attribution'
    container.innerHTML = '<a href="https://openmaptiles.org/">© OpenMapTiles</a> · '
      + '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    this.container = container
    this.dismissTimeout = setTimeout(() => {
      this.container?.remove()
      this.container = null
      this.dismissTimeout = null
    }, ATTRIBUTION_DISPLAY_DURATION_MS)
    return container
  }

  onRemove(): void {
    if (this.dismissTimeout !== null) clearTimeout(this.dismissTimeout)
    this.dismissTimeout = null
    this.container?.remove()
    this.container = null
  }
}

export interface MapLifecycle {
  readonly map: Map
  readonly ready: Promise<void>
  setViewportInsets(insets: MapViewportInsets): void
  setPresentationBottomInset(bottom: number | null): void
  /** While on, zoom keeps the visible-area centre (where the crosshair sits) fixed. */
  setVisibleCenterZoom(enabled: boolean): void
  /** While on, map taps place the waypoint even when they land on existing map features. */
  setWaypointPlacementActive(active: boolean): void
  dispose(): void
}

export function waitForMapStyleLoaded(
  map: Map,
  signal: AbortSignal,
  onBasemapUnavailable?: () => void,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The map style load was aborted', 'AbortError'))
  }
  if (map.isStyleLoaded()) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(fallbackTimer)
      map.off('style.load', handleLoad)
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

    // A missing remote style must not block local campus data indefinitely.
    const fallbackTimer = setTimeout(() => {
      onBasemapUnavailable?.()
      map.setStyle(OFFLINE_STYLE)
    }, STYLE_LOAD_TIMEOUT_MS)
    map.once('style.load', handleLoad)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export function createMapLifecycle(options: MapSessionOptions): MapLifecycle {
  const controller = new AbortController()
  const startsOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const map = new Map({
    container: options.container,
    style: startsOffline ? OFFLINE_STYLE : MAP_STYLE,
    center: KENT_RIDGE_LOCATION,
    zoom: 15,
    attributionControl: false,
  })
  const navigationControl = new NavigationControl()
  const attributionControl = new NusgoAttributionControl()
  let disposed = false
  let viewportInsets: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  let presentationBottomInset: number | null = null
  let visibleCenterZoom = false
  let applyingViewportInsets = false
  let waypointPlacementActive = false
  let markerPointerGesture: { readonly pointerId: number; readonly x: number; readonly y: number; moved: boolean } | null = null
  let suppressMarkerReleaseClick = false

  const handleMapError = (event: { error?: unknown }) => {
    if (!disposed) options.onMapError(event.error)
  }

  const handlePlacementPointerDown = (event: Event): void => {
    const pointer = event as PointerEvent
    const target = pointer.target
    const startedOnMarker = typeof Element !== 'undefined' && target instanceof Element
      && target.closest('.maplibregl-marker') !== null
    markerPointerGesture = !disposed && waypointPlacementActive && startedOnMarker
      ? { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, moved: false }
      : null
    suppressMarkerReleaseClick = false
  }

  const handlePlacementPointerMove = (event: Event): void => {
    const pointer = event as PointerEvent
    const gesture = markerPointerGesture
    if (!gesture || pointer.pointerId !== gesture.pointerId || gesture.moved) return
    if (Math.hypot(pointer.clientX - gesture.x, pointer.clientY - gesture.y) >= MARKER_DRAG_SLOP_PX) {
      gesture.moved = true
    }
  }

  const handlePlacementPointerUp = (event: Event): void => {
    const pointer = event as PointerEvent
    const gesture = markerPointerGesture
    if (!gesture || pointer.pointerId !== gesture.pointerId) return
    suppressMarkerReleaseClick = gesture.moved
    markerPointerGesture = null
  }

  const handlePlacementPointerCancel = (event: Event): void => {
    const pointer = event as PointerEvent
    if (!markerPointerGesture || pointer.pointerId !== markerPointerGesture.pointerId) return
    markerPointerGesture = null
    suppressMarkerReleaseClick = false
  }

  const handlePlacementMapClick = (event: MouseEvent): void => {
    if (disposed || !waypointPlacementActive) return
    if (suppressMarkerReleaseClick) {
      suppressMarkerReleaseClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    const target = event.target
    if (typeof Element !== 'undefined' && target instanceof Element && target.closest(
      '.maplibregl-popup, .maplibregl-control, .maplibregl-ctrl, .location-control',
    )) return

    const bounds = options.container.getBoundingClientRect()
    const point = map.unproject([event.clientX - bounds.left, event.clientY - bounds.top])
    options.onEmptyMapClick([point.lng, point.lat])
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  options.container.addEventListener?.('pointerdown', handlePlacementPointerDown, true)
  options.container.addEventListener?.('pointermove', handlePlacementPointerMove, true)
  options.container.addEventListener?.('pointerup', handlePlacementPointerUp, true)
  options.container.addEventListener?.('pointercancel', handlePlacementPointerCancel, true)
  options.container.addEventListener?.('click', handlePlacementMapClick, true)

  const getVisibleCenter = (
    insets: MapViewportInsets,
    clientWidth: number,
    clientHeight: number,
  ): [number, number] => [
    Math.max(0, Math.min(clientWidth, (clientWidth + insets.left - insets.right) / 2)),
    Math.max(0, Math.min(clientHeight, (clientHeight + insets.top - insets.bottom) / 2)),
  ]

  const reportMapCenter = (): void => {
    if (disposed || applyingViewportInsets || !options.onMapCenterChange) return
    const { clientWidth, clientHeight } = map.getContainer()
    const insets = visibleCenterZoom ? getEffectiveInsets() : viewportInsets
    const center = clientWidth > 0 && clientHeight > 0
      ? map.unproject(getVisibleCenter(insets, clientWidth, clientHeight))
      : map.getCenter()
    options.onMapCenterChange([center.lng, center.lat])
  }

  const handleMoveStart = (): void => {
    if (!disposed) options.onMapMovingChange?.(true)
  }
  const handleMoveEnd = (): void => {
    if (disposed) return
    reportMapCenter()
    options.onMapMovingChange?.(false)
  }

  // Active padding aligns MapLibre's centre with the crosshair. Identical padding
  // must be skipped because MapLibre's setPadding calls jumpTo and cancels a running flyTo.
  let appliedPadding: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  const isPaddingApplied = (padding: MapViewportInsets): boolean =>
    padding.top === appliedPadding.top && padding.right === appliedPadding.right &&
    padding.bottom === appliedPadding.bottom && padding.left === appliedPadding.left

  const getEffectiveInsets = (): MapViewportInsets => {
    const { clientWidth, clientHeight } = map.getContainer()
    const insets = presentationBottomInset === null
      ? viewportInsets
      : { ...viewportInsets, bottom: presentationBottomInset }
    const maxHorizontal = Math.max(0, clientWidth - 1)
    const maxVertical = Math.max(0, clientHeight - 1)
    const left = Math.min(insets.left, maxHorizontal)
    const top = Math.min(insets.top, maxVertical)
    return {
      top,
      right: Math.max(0, Math.min(insets.right, maxHorizontal - left)),
      bottom: Math.max(0, Math.min(insets.bottom, maxVertical - top)),
      left,
    }
  }

  const applyEffectiveInsets = (): void => {
    if (!visibleCenterZoom) return
    const insets = getEffectiveInsets()
    if (isPaddingApplied(insets)) return
    applyingViewportInsets = true
    try {
      appliedPadding = { ...insets }
      map.setPadding(insets)
    } finally {
      applyingViewportInsets = false
    }
  }

  const setPaddingKeepingView = (padding: MapViewportInsets): void => {
    if (isPaddingApplied(padding)) return
    appliedPadding = { ...padding }
    const { clientWidth, clientHeight } = map.getContainer()
    const anchor = map.unproject([clientWidth / 2, clientHeight / 2])
    map.setPadding(padding)
    const moved = map.project(anchor)
    map.panBy([moved.x - clientWidth / 2, moved.y - clientHeight / 2], { animate: false })
  }

  // MapLibre's double-click and double-tap zoom always anchors on the pointer and has no
  // `around` option, so while the crosshair shows they are replaced by a plain zoom about
  // the padded centre.
  let touchStart: { readonly time: number; readonly x: number; readonly y: number } | null = null
  let lastTap: { readonly time: number; readonly x: number; readonly y: number } | null = null
  let lastDoubleZoomAt = 0

  const zoomAboutCenter = (zoomOut: boolean): void => {
    lastDoubleZoomAt = Date.now()
    if (zoomOut) map.zoomOut({ duration: DOUBLE_ZOOM_DURATION_MS })
    else map.zoomIn({ duration: DOUBLE_ZOOM_DURATION_MS })
  }

  const handleDoubleClick = (event: MapMouseEvent) => {
    event.preventDefault()
    // A touch double-tap can also raise dblclick; one gesture should zoom once.
    if (Date.now() - lastDoubleZoomAt < DOUBLE_ZOOM_DEBOUNCE_MS) return
    zoomAboutCenter(event.originalEvent.shiftKey)
  }

  const handleTouchStart = (event: MapTouchEvent) => {
    const { touches } = event.originalEvent
    if (touches.length !== 1) {
      touchStart = null
      lastTap = null
      return
    }
    touchStart = { time: Date.now(), x: touches[0].clientX, y: touches[0].clientY }
  }

  const handleTouchEnd = (event: MapTouchEvent) => {
    const { touches, changedTouches } = event.originalEvent
    const start = touchStart
    touchStart = null
    if (!start || touches.length > 0 || changedTouches.length !== 1) return
    const now = Date.now()
    const { clientX: x, clientY: y } = changedTouches[0]
    const isTap = now - start.time < DOUBLE_TAP_MS && Math.hypot(x - start.x, y - start.y) < TAP_SLOP_PX
    if (!isTap) {
      lastTap = null
      return
    }
    const previous = lastTap
    if (previous && now - previous.time < DOUBLE_TAP_MS && Math.hypot(x - previous.x, y - previous.y) < TAP_SLOP_PX * 2) {
      lastTap = null
      zoomAboutCenter(false)
      return
    }
    lastTap = { time: now, x, y }
  }

  const removeDoubleZoomHandlers = (): void => {
    map.off('dblclick', handleDoubleClick)
    map.off('touchstart', handleTouchStart)
    map.off('touchend', handleTouchEnd)
    touchStart = null
    lastTap = null
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

    options.onEmptyMapClick([event.lngLat.lng, event.lngLat.lat])
  }

  map.addControl(navigationControl, 'top-right')
  map.addControl(attributionControl, 'bottom-right')
  map.on('error', handleMapError)
  map.on('click', handleMapClick)
  map.on('movestart', handleMoveStart)
  map.on('moveend', handleMoveEnd)
  if (options.onMapCenterChange) {
    map.on('resize', reportMapCenter)
    reportMapCenter()
  }

  if (startsOffline) options.onBasemapUnavailable?.()
  const ready = waitForMapStyleLoaded(map, controller.signal, options.onBasemapUnavailable)

  return {
    map,
    ready,
    setViewportInsets(insets) {
      if (disposed) return
      viewportInsets = { ...insets }
      applyEffectiveInsets()
      if (presentationBottomInset === null) reportMapCenter()
    },
    setPresentationBottomInset(bottom) {
      if (disposed) return
      presentationBottomInset = bottom === null ? null : Math.max(0, bottom)
      applyEffectiveInsets()
      if (presentationBottomInset === null) reportMapCenter()
    },
    setVisibleCenterZoom(enabled) {
      if (disposed || enabled === visibleCenterZoom) return
      visibleCenterZoom = enabled
      setPaddingKeepingView(enabled ? getEffectiveInsets() : { top: 0, right: 0, bottom: 0, left: 0 })
      // `around: 'center'` follows the padded centre; plain enable() restores pointer-anchored zoom.
      // enable() ignores new options while already enabled, so the handlers are reset first.
      const zoomOptions = enabled ? { around: 'center' as const } : undefined
      map.scrollZoom.disable()
      map.scrollZoom.enable(zoomOptions)
      map.touchZoomRotate.disable()
      map.touchZoomRotate.enable(zoomOptions)
      if (enabled) {
        map.doubleClickZoom.disable()
        map.on('dblclick', handleDoubleClick)
        map.on('touchstart', handleTouchStart)
        map.on('touchend', handleTouchEnd)
      } else {
        removeDoubleZoomHandlers()
        map.doubleClickZoom.enable()
      }
    },
    setWaypointPlacementActive(active) {
      if (disposed) return
      waypointPlacementActive = active
      if (!active) {
        markerPointerGesture = null
        suppressMarkerReleaseClick = false
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      options.container.removeEventListener?.('pointerdown', handlePlacementPointerDown, true)
      options.container.removeEventListener?.('pointermove', handlePlacementPointerMove, true)
      options.container.removeEventListener?.('pointerup', handlePlacementPointerUp, true)
      options.container.removeEventListener?.('pointercancel', handlePlacementPointerCancel, true)
      options.container.removeEventListener?.('click', handlePlacementMapClick, true)
      controller.abort()
      map.off('error', handleMapError)
      map.off('click', handleMapClick)
      map.off('movestart', handleMoveStart)
      map.off('moveend', handleMoveEnd)
      removeDoubleZoomHandlers()
      if (options.onMapCenterChange) {
        map.off('resize', reportMapCenter)
      }
      map.removeControl(navigationControl)
      map.removeControl(attributionControl)
      map.remove()
    },
  }
}

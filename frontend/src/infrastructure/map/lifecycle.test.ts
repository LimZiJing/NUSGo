import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForMapStyleLoaded } from './lifecycle'
import { createMapLifecycle } from './lifecycle'
import {
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
} from './transit'

const fakeMapState = vi.hoisted(() => ({ maps: [] as unknown[] }))

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'worker.js',
}))

vi.mock('maplibre-gl', () => ({
  Map: class FakeMap {
    readonly options: Record<string, unknown>
    readonly handlers = new globalThis.Map<string, Set<(event: unknown) => void>>()
    readonly layers = new Set<string>()
    readonly renderedFeatures: unknown[] = []
    readonly addedControls: unknown[] = []
    readonly removedControls: unknown[] = []
    readonly containerSize = { clientWidth: 390, clientHeight: 844 }
    readonly on = vi.fn((event: string, handler: (event: unknown) => void) => {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    })
    readonly off = vi.fn((event: string, handler: (event: unknown) => void) => {
      this.handlers.get(event)?.delete(handler)
      return this
    })
    readonly once = vi.fn((event: string, handler: (event: unknown) => void) => this.on(event, handler))
    readonly addControl = vi.fn((control: unknown) => {
      this.addedControls.push(control)
      return this
    })
    readonly removeControl = vi.fn((control: unknown) => {
      this.removedControls.push(control)
      return this
    })
    readonly getLayer = vi.fn((id: string) => this.layers.has(id) ? {} : undefined)
    readonly queryRenderedFeatures = vi.fn(() => this.renderedFeatures)
    readonly getContainer = vi.fn(() => this.containerSize)
    readonly getCenter = vi.fn(() => ({ lng: 103, lat: 1 }))
    readonly unproject = vi.fn(([x, y]: [number, number]) => ({ lng: x, lat: y }))
    readonly project = vi.fn((point: { lng: number; lat: number }) => ({ x: point.lng, y: point.lat }))
    readonly setPadding = vi.fn()
    readonly zoomIn = vi.fn()
    readonly zoomOut = vi.fn()
    readonly doubleClickZoom = { enable: vi.fn(), disable: vi.fn() }
    readonly panBy = vi.fn()
    readonly scrollZoom = { enable: vi.fn(), disable: vi.fn() }
    readonly touchZoomRotate = { enable: vi.fn(), disable: vi.fn() }
    readonly remove = vi.fn()

    constructor(options: Record<string, unknown>) {
      this.options = options
      fakeMapState.maps.push(this)
    }

    isStyleLoaded() {
      return true
    }

    emit(event: string, payload: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload))
    }
  },
  NavigationControl: class {},
  setWorkerUrl: vi.fn(),
}))

class FakeElement {
  private readonly matchingSelector: string | null

  constructor(matchingSelector: string | null) {
    this.matchingSelector = matchingSelector
  }

  closest(selector: string) {
    return this.matchingSelector && selector.includes(this.matchingSelector)
      ? this
      : null
  }
}

type FakeMap = {
  readonly options: Record<string, unknown>
  readonly handlers: Map<string, Set<(event: unknown) => void>>
  readonly layers: Set<string>
  readonly renderedFeatures: unknown[]
  readonly addedControls: unknown[]
  readonly removedControls: unknown[]
  readonly containerSize: { clientWidth: number; clientHeight: number }
  readonly on: ReturnType<typeof vi.fn>
  readonly off: ReturnType<typeof vi.fn>
  readonly addControl: ReturnType<typeof vi.fn>
  readonly removeControl: ReturnType<typeof vi.fn>
  readonly queryRenderedFeatures: ReturnType<typeof vi.fn>
  readonly getContainer: ReturnType<typeof vi.fn>
  readonly unproject: ReturnType<typeof vi.fn>
  readonly setPadding: ReturnType<typeof vi.fn>
  readonly zoomIn: ReturnType<typeof vi.fn>
  readonly zoomOut: ReturnType<typeof vi.fn>
  readonly doubleClickZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> }
  readonly panBy: ReturnType<typeof vi.fn>
  readonly scrollZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> }
  readonly touchZoomRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> }
  readonly remove: ReturnType<typeof vi.fn>
  emit(event: string, payload: unknown): void
}

beforeEach(() => {
  fakeMapState.maps.length = 0
})

describe('map lifecycle visible-centre zoom', () => {
  const createLifecycle = () => {
    const lifecycle = createMapLifecycle({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    return { lifecycle, map: fakeMapState.maps.at(-1) as FakeMap }
  }

  it('pads the map by the viewport insets and zooms about the centre while enabled', () => {
    const { lifecycle, map } = createLifecycle()
    const insets = { top: 76, right: 0, bottom: 400, left: 0 }
    lifecycle.setViewportInsets(insets)

    lifecycle.setVisibleCenterZoom(true)

    expect(map.setPadding).toHaveBeenLastCalledWith(insets)
    expect(map.scrollZoom.enable).toHaveBeenLastCalledWith({ around: 'center' })
    expect(map.touchZoomRotate.enable).toHaveBeenLastCalledWith({ around: 'center' })
    expect(map.scrollZoom.disable).toHaveBeenCalledBefore(map.scrollZoom.enable)
    expect(map.panBy).toHaveBeenCalledWith([0, 0], { animate: false })
    lifecycle.dispose()
  })

  it('follows later inset changes only while enabled', () => {
    const { lifecycle, map } = createLifecycle()
    lifecycle.setViewportInsets({ top: 0, right: 0, bottom: 100, left: 0 })
    expect(map.setPadding).not.toHaveBeenCalled()

    lifecycle.setVisibleCenterZoom(true)
    lifecycle.setViewportInsets({ top: 0, right: 0, bottom: 300, left: 0 })

    expect(map.setPadding).toHaveBeenLastCalledWith({ top: 0, right: 0, bottom: 300, left: 0 })
    lifecycle.dispose()
  })

  it('clears padding and restores default pointer-anchored zoom when disabled', () => {
    const { lifecycle, map } = createLifecycle()
    lifecycle.setViewportInsets({ top: 0, right: 0, bottom: 300, left: 0 })
    lifecycle.setVisibleCenterZoom(true)

    lifecycle.setVisibleCenterZoom(false)

    expect(map.setPadding).toHaveBeenLastCalledWith({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(map.scrollZoom.enable).toHaveBeenLastCalledWith(undefined)
    expect(map.touchZoomRotate.enable).toHaveBeenLastCalledWith(undefined)
    lifecycle.dispose()
  })

  describe('double-click and double-tap zoom', () => {
    const touch = (x: number, y: number) => ({ clientX: x, clientY: y })
    const tap = (map: FakeMap, x = 100, y = 200) => {
      map.emit('touchstart', { originalEvent: { touches: [touch(x, y)], changedTouches: [touch(x, y)] } })
      map.emit('touchend', { originalEvent: { touches: [], changedTouches: [touch(x, y)] } })
    }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-24T08:00:00Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('replaces pointer-anchored double-click zoom with centre zoom while enabled', () => {
      const { lifecycle, map } = createLifecycle()
      lifecycle.setVisibleCenterZoom(true)

      expect(map.doubleClickZoom.disable).toHaveBeenCalled()
      const preventDefault = vi.fn()
      map.emit('dblclick', { preventDefault, originalEvent: { shiftKey: false } })
      expect(preventDefault).toHaveBeenCalled()
      expect(map.zoomIn).toHaveBeenCalledWith({ duration: 300 })

      vi.advanceTimersByTime(1000)
      map.emit('dblclick', { preventDefault, originalEvent: { shiftKey: true } })
      expect(map.zoomOut).toHaveBeenCalledWith({ duration: 300 })
      lifecycle.dispose()
    })

    it('zooms in once on a double-tap, even if dblclick follows', () => {
      const { lifecycle, map } = createLifecycle()
      lifecycle.setVisibleCenterZoom(true)

      tap(map)
      vi.advanceTimersByTime(150)
      tap(map)
      map.emit('dblclick', { preventDefault: vi.fn(), originalEvent: { shiftKey: false } })

      expect(map.zoomIn).toHaveBeenCalledTimes(1)
      lifecycle.dispose()
    })

    it('ignores slow taps, taps far apart, and dragged touches', () => {
      const { lifecycle, map } = createLifecycle()
      lifecycle.setVisibleCenterZoom(true)

      tap(map)
      vi.advanceTimersByTime(600)
      tap(map)
      vi.advanceTimersByTime(100)
      tap(map, 300, 500)
      map.emit('touchstart', { originalEvent: { touches: [touch(0, 0)], changedTouches: [touch(0, 0)] } })
      map.emit('touchend', { originalEvent: { touches: [], changedTouches: [touch(80, 0)] } })
      tap(map, 80, 0)

      expect(map.zoomIn).not.toHaveBeenCalled()
      lifecycle.dispose()
    })

    it('restores MapLibre double-click zoom and stops handling taps when disabled', () => {
      const { lifecycle, map } = createLifecycle()
      lifecycle.setVisibleCenterZoom(true)
      lifecycle.setVisibleCenterZoom(false)

      expect(map.doubleClickZoom.enable).toHaveBeenCalled()
      tap(map)
      vi.advanceTimersByTime(100)
      tap(map)
      expect(map.zoomIn).not.toHaveBeenCalled()
      lifecycle.dispose()
    })
  })

  it('does nothing when the mode is unchanged', () => {
    const { lifecycle, map } = createLifecycle()

    lifecycle.setVisibleCenterZoom(false)

    expect(map.setPadding).not.toHaveBeenCalled()
    lifecycle.dispose()
  })
})

describe('map lifecycle style readiness', () => {
  it('keeps map attribution visible without the compact disclosure control', () => {
    const lifecycle = createMapLifecycle({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const map = fakeMapState.maps.at(-1) as FakeMap

    expect(map.options).toEqual(expect.objectContaining({
      attributionControl: false,
    }))

    lifecycle.dispose()
  })

  it('reports the centre of the visible map after movement, inset, and size changes', () => {
    const onMapCenterChange = vi.fn()
    const lifecycle = createMapLifecycle({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
      onMapCenterChange,
    })
    const map = fakeMapState.maps.at(-1) as FakeMap

    expect(onMapCenterChange).toHaveBeenLastCalledWith([195, 422])
    lifecycle.setViewportInsets({ top: 0, right: 12, bottom: 400, left: 12 })
    expect(onMapCenterChange).toHaveBeenLastCalledWith([195, 222])
    map.emit('moveend', undefined)
    expect(onMapCenterChange).toHaveBeenCalledTimes(3)
    map.containerSize.clientHeight = 700
    map.emit('resize', undefined)
    expect(onMapCenterChange).toHaveBeenLastCalledWith([195, 150])

    lifecycle.dispose()
    map.emit('moveend', undefined)
    expect(onMapCenterChange).toHaveBeenCalledTimes(4)
  })

  it('rejects immediately for an already-aborted signal without registering listeners', async () => {
    const map = {
      isStyleLoaded: vi.fn(() => false),
      once: vi.fn(),
      off: vi.fn(),
    }
    const controller = new AbortController()
    controller.abort()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')

    const pending = waitForMapStyleLoaded(map as never, controller.signal)

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(map.isStyleLoaded).not.toHaveBeenCalled()
    expect(map.once).not.toHaveBeenCalled()
    expect(map.off).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('removes load and abort listeners when a pending style load is aborted', async () => {
    let loadHandler: (() => void) | undefined
    const map = {
      isStyleLoaded: vi.fn(() => false),
      once: vi.fn((_event: string, handler: () => void) => {
        loadHandler = handler
        return map
      }),
      off: vi.fn(() => map),
    }
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = waitForMapStyleLoaded(map as never, controller.signal)

    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(map.off).toHaveBeenCalledWith('load', loadHandler)
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('resolves through a pending load event and removes load and abort listeners', async () => {
    let loadHandler: (() => void) | undefined
    const map = {
      isStyleLoaded: vi.fn(() => false),
      once: vi.fn((_event: string, handler: () => void) => {
        loadHandler = handler
        return map
      }),
      off: vi.fn(() => map),
    }
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const pending = waitForMapStyleLoaded(map as never, controller.signal)

    expect(loadHandler).toBeDefined()
    loadHandler?.()

    await expect(pending).resolves.toBeUndefined()
    expect(map.off).toHaveBeenCalledWith('load', loadHandler)
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('reports errors, filters non-empty map clicks, and cleans up idempotently', async () => {
    vi.stubGlobal('Element', FakeElement)
    const onMapError = vi.fn()
    const onEmptyMapClick = vi.fn()
    const lifecycle = createMapLifecycle({
      container: {} as HTMLElement,
      onMapError,
      onEmptyMapClick,
    })
    const map = fakeMapState.maps.at(-1) as FakeMap
    map.layers.add(TRANSIT_ROUTE_CASING_LAYER_ID)
    map.layers.add(TRANSIT_ROUTE_LAYER_ID)
    map.layers.add(TRANSIT_ROUTE_DIRECTION_LAYER_ID)
    await lifecycle.ready

    const mapError = new Error('tile failed')
    map.emit('error', { error: mapError })
    expect(onMapError).toHaveBeenCalledWith(mapError)

    const click = (target: FakeElement) => map.emit('click', {
      point: { x: 10, y: 20 },
      lngLat: { lng: 103.78, lat: 1.29 },
      originalEvent: { target },
    })
    click(new FakeElement('.maplibregl-marker'))
    click(new FakeElement('.maplibregl-popup'))
    click(new FakeElement('.maplibregl-control'))
    click(new FakeElement('.maplibregl-ctrl'))
    click(new FakeElement('.location-control'))
    expect(onEmptyMapClick).not.toHaveBeenCalled()

    map.renderedFeatures.push({ routeId: 'A1' })
    click(new FakeElement(null))
    expect(map.queryRenderedFeatures).toHaveBeenCalledOnce()
    expect(onEmptyMapClick).not.toHaveBeenCalled()

    map.renderedFeatures.length = 0
    click(new FakeElement(null))
    expect(onEmptyMapClick).toHaveBeenCalledOnce()
    expect(onEmptyMapClick).toHaveBeenCalledWith([103.78, 1.29])

    lifecycle.dispose()
    lifecycle.dispose()
    map.emit('error', { error: new Error('late error') })
    click(new FakeElement(null))

    expect(onMapError).toHaveBeenCalledOnce()
    expect(onEmptyMapClick).toHaveBeenCalledOnce()
    expect(map.removeControl).toHaveBeenCalledTimes(2)
    expect(map.remove).toHaveBeenCalledOnce()
    expect(map.off).toHaveBeenCalledWith('error', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('click', expect.any(Function))
    expect(map.handlers.get('error')?.size).toBe(0)
    expect(map.handlers.get('click')?.size).toBe(0)
    vi.unstubAllGlobals()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    readonly handlers = new globalThis.Map<string, Set<(event: unknown) => void>>()
    readonly layers = new Set<string>()
    readonly renderedFeatures: unknown[] = []
    readonly addedControls: unknown[] = []
    readonly removedControls: unknown[] = []
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
    readonly remove = vi.fn()

    constructor() {
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
  readonly handlers: Map<string, Set<(event: unknown) => void>>
  readonly layers: Set<string>
  readonly renderedFeatures: unknown[]
  readonly addedControls: unknown[]
  readonly removedControls: unknown[]
  readonly on: ReturnType<typeof vi.fn>
  readonly off: ReturnType<typeof vi.fn>
  readonly addControl: ReturnType<typeof vi.fn>
  readonly removeControl: ReturnType<typeof vi.fn>
  readonly queryRenderedFeatures: ReturnType<typeof vi.fn>
  readonly remove: ReturnType<typeof vi.fn>
  emit(event: string, payload: unknown): void
}

beforeEach(() => {
  fakeMapState.maps.length = 0
})

describe('map lifecycle style readiness', () => {
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
      originalEvent: { target },
    })
    click(new FakeElement('.maplibregl-marker'))
    click(new FakeElement('.maplibregl-popup'))
    click(new FakeElement('.maplibregl-control'))
    expect(onEmptyMapClick).not.toHaveBeenCalled()

    map.renderedFeatures.push({ routeId: 'A1' })
    click(new FakeElement(null))
    expect(map.queryRenderedFeatures).toHaveBeenCalledOnce()
    expect(onEmptyMapClick).not.toHaveBeenCalled()

    map.renderedFeatures.length = 0
    click(new FakeElement(null))
    expect(onEmptyMapClick).toHaveBeenCalledOnce()

    lifecycle.dispose()
    lifecycle.dispose()
    map.emit('error', { error: new Error('late error') })
    click(new FakeElement(null))

    expect(onMapError).toHaveBeenCalledOnce()
    expect(onEmptyMapClick).toHaveBeenCalledOnce()
    expect(map.removeControl).toHaveBeenCalledOnce()
    expect(map.remove).toHaveBeenCalledOnce()
    expect(map.off).toHaveBeenCalledWith('error', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('click', expect.any(Function))
    expect(map.handlers.get('error')?.size).toBe(0)
    expect(map.handlers.get('click')?.size).toBe(0)
    vi.unstubAllGlobals()
  })
})

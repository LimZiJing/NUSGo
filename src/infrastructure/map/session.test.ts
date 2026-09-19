import { describe, expect, it, vi } from 'vitest'
import { createMapSession } from './session'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import { createTransitIndex } from '../../domain/transit'
import type { TransitRouteGeometry } from '../../domain/transit/types'
import type { VenueLocation } from '../../domain/venue/types'

const fakeMapState = vi.hoisted(() => ({
  maps: [] as unknown[],
  popups: [] as unknown[],
}))

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'worker.js',
}))

vi.mock('maplibre-gl', () => {
  class FakeMap {
    readonly sources = new Set<string>()
    readonly layers = new Set<string>()
    readonly handlers = new globalThis.Map<string, Set<(...args: never[]) => void>>()
    readonly removedSources: string[] = []
    readonly removedLayers: string[] = []
    readonly addedMarkers: FakeMarker[] = []
    readonly on = vi.fn((event: string, handler: (...args: never[]) => void) => {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    })
    readonly off = vi.fn((event: string, handler: (...args: never[]) => void) => {
      this.handlers.get(event)?.delete(handler)
      return this
    })
    readonly once = vi.fn((event: string, handler: (...args: never[]) => void) => this.on(event, handler))
    readonly addControl = vi.fn(() => this)
    readonly removeControl = vi.fn(() => this)
    readonly addSource = vi.fn((id: string) => this.sources.add(id))
    readonly addLayer = vi.fn((layer: { id: string }) => this.layers.add(layer.id))
    readonly removeSource = vi.fn((id: string) => {
      this.removedSources.push(id)
      this.sources.delete(id)
    })
    readonly removeLayer = vi.fn((id: string) => {
      this.removedLayers.push(id)
      this.layers.delete(id)
    })
    readonly setFilter = vi.fn()
    readonly setLayerZoomRange = vi.fn()
    readonly setPaintProperty = vi.fn()
    readonly getContainer = vi.fn(() => ({ clientWidth: 1200 }))
    readonly fitBounds = vi.fn()
    readonly getZoom = vi.fn(() => 15)
    readonly flyTo = vi.fn()
    readonly queryRenderedFeatures = vi.fn(() => [])
    readonly remove = vi.fn()

    constructor() {
      fakeMapState.maps.push(this)
    }

    isStyleLoaded() {
      return true
    }

    getSource(id: string) {
      return this.sources.has(id) ? {} : undefined
    }

    getLayer(id: string) {
      return this.layers.has(id) ? {} : undefined
    }
  }

  class FakeNavigationControl {}

  class FakeMarker {
    readonly element: HTMLElement
    popup: FakePopup | null = null
    readonly remove = vi.fn()

    constructor(options: { element?: HTMLElement }) {
      this.element = options.element ?? document.createElement('div')
    }

    getElement() {
      return this.element
    }

    setLngLat() {
      return this
    }

    setPopup(popup: FakePopup) {
      this.popup = popup
      return this
    }

    getPopup() {
      return this.popup
    }

    addTo(map: FakeMap) {
      map.addedMarkers.push(this)
      return this
    }
  }

  class FakePopup {
    readonly handlers = new globalThis.Map<string, Set<() => void>>()
    readonly remove = vi.fn(() => {
      this.handlers.get('close')?.forEach((handler) => handler())
      return this
    })

    constructor() {
      fakeMapState.popups.push(this)
    }

    setDOMContent() {
      return this
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    }

    off(event: string, handler: () => void) {
      this.handlers.get(event)?.delete(handler)
      return this
    }

    isOpen() {
      return false
    }
  }

  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    NavigationControl: FakeNavigationControl,
    setWorkerUrl: vi.fn(),
  }
})

class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly style = {
    display: '',
    setProperty: vi.fn(),
  }
  readonly classList = { toggle: vi.fn() }
  textContent = ''
  type = ''
  className = ''

  append(...children: FakeElement[]) {
    this.children.push(...children)
  }

  addEventListener() {}

  removeEventListener() {}

  setAttribute() {}
}

function createTransitData() {
  const network = createValidTransitNetwork()
  const geometry: TransitRouteGeometry = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.1, 1.1]] },
    }],
  }
  const index = createTransitIndex(network)
  return { network: index.network, geometry, index }
}

describe('MapSession', () => {
  it('replaces transit installations and makes disposal idempotent', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const transitData = createTransitData()
    const map = fakeMapState.maps.at(-1) as {
      removedSources: string[]
      removedLayers: string[]
      addedMarkers: Array<{ remove: ReturnType<typeof vi.fn> }>
      off: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
      removeControl: ReturnType<typeof vi.fn>
    }

    await session.ready
    session.setTripRequest(
      { origin: { kind: 'stop', id: 'STOP-A' }, destination: null },
      {},
      null,
    )
    expect(session.loadTransitData(transitData)).toBe(transitData.index.stops.length)
    expect(session.loadTransitData(transitData)).toBe(transitData.index.stops.length)

    session.dispose()
    session.dispose()
    expect(map.removedLayers).toHaveLength(10)
    expect(map.removedSources).toHaveLength(4)
    expect(map.addedMarkers).toHaveLength((transitData.index.stops.length + 1) * 2)
    expect(map.addedMarkers.every((marker) => marker.remove.mock.calls.length === 1)).toBe(true)
    expect(fakeMapState.popups).toHaveLength((transitData.index.stops.length + 1) * 2)
    expect(fakeMapState.popups.every((popup) => (
      (popup as { remove: ReturnType<typeof vi.fn> }).remove.mock.calls.length === 1
    ))).toBe(true)
    expect(map.off).toHaveBeenCalled()
    expect(map.removeControl).toHaveBeenCalledOnce()
    expect(map.remove).toHaveBeenCalledOnce()

    const markerCount = map.addedMarkers.length
    const removedLayerCount = map.removedLayers.length
    session.setRouteSelection({ route: null, overlappingRouteIds: new Set() })
    session.setTripRequest({ origin: null, destination: null }, {}, null)
    session.selectVenue({} as VenueLocation)
    session.clearVenue()
    expect(map.addedMarkers).toHaveLength(markerCount)
    expect(map.removedLayers).toHaveLength(removedLayerCount)
    expect(session.loadTransitData(transitData)).toBe(0)

    vi.unstubAllGlobals()
  })
})

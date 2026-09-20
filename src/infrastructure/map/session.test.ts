import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    readonly paintProperties = new globalThis.Map<string, unknown>()
    readonly filters = new globalThis.Map<string, unknown>()
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
    readonly setFilter = vi.fn((id: string, filter: unknown) => {
      this.filters.set(id, filter)
    })
    readonly setLayerZoomRange = vi.fn()
    readonly setPaintProperty = vi.fn((id: string, name: string, value: unknown) => {
      this.paintProperties.set(`${id}:${name}`, value)
    })
    readonly getContainer = vi.fn(() => ({ clientWidth: 1200 }))
    readonly fitBounds = vi.fn()
    readonly getZoom = vi.fn(() => 15)
    readonly flyTo = vi.fn()
    readonly zoomIn = vi.fn()
    readonly zoomOut = vi.fn()
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
    coordinate: unknown = null
    readonly remove = vi.fn()

    constructor(options: { element?: HTMLElement }) {
      this.element = options.element ?? document.createElement('div')
    }

    getElement() {
      return this.element
    }

    setLngLat(coordinate: unknown) {
      this.coordinate = coordinate
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
  readonly classes = new Set<string>()
  readonly classList = {
    toggle: vi.fn((name: string, force: boolean) => {
      if (force) this.classes.add(name)
      else this.classes.delete(name)
    }),
  }
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

function createTransitData(routeId = 'A1', color = '#123456') {
  const network = createValidTransitNetwork()
  network.routes[0].id = routeId
  network.routes[0].name = routeId
  network.routes[0].color = color
  network.stops.forEach((stop) => {
    stop.services = [routeId, ...(stop.id === 'STOP-A' ? ['PUB:95'] : [])]
  })
  const geometry: TransitRouteGeometry = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId, name: routeId, color },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.1, 1.1]] },
    }],
  }
  const index = createTransitIndex(network)
  return { network: index.network, geometry, index }
}

function createRouteSelection(data: ReturnType<typeof createTransitData>) {
  return {
    route: data.index.routes[0],
    overlappingRouteIds: new Set<string>(),
  }
}

describe('MapSession', () => {
  beforeEach(() => {
    fakeMapState.maps.length = 0
    fakeMapState.popups.length = 0
    vi.unstubAllGlobals()
  })

  it('preserves a valid route presentation across transit reloads without refitting', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const transitData = createTransitData()
    const map = fakeMapState.maps.at(-1) as {
      addedMarkers: Array<{ element: FakeElement; getElement: () => FakeElement }>
      fitBounds: ReturnType<typeof vi.fn>
      paintProperties: Map<string, unknown>
    }

    await session.ready
    const selectedRoute = createRouteSelection(transitData)
    session.loadTransitData(transitData, {
      route: null,
      overlappingRouteIds: new Set(),
    })
    session.setRouteSelection(selectedRoute)

    expect(map.fitBounds).toHaveBeenCalledOnce()
    session.loadTransitData(transitData, selectedRoute)

    expect(map.fitBounds).toHaveBeenCalledOnce()
    expect(map.paintProperties.get('shuttle-route-lines:line-color')).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'A1'],
      ['get', 'color'],
      '#64748b',
    ])
    const reloadedMarkers = map.addedMarkers.slice(-transitData.index.stops.length)
    expect(reloadedMarkers.map((marker) => marker.element.classes.has('bus-stop-marker-selected')))
      .toEqual([true, true])

    session.setRouteSelection({ route: null, overlappingRouteIds: new Set() })

    expect(map.fitBounds).toHaveBeenCalledTimes(2)
    expect(map.paintProperties.get('shuttle-route-lines:line-color')).toBe('#64748b')
    expect(reloadedMarkers.every((marker) => (
      !marker.element.classes.has('bus-stop-marker-selected') &&
      !marker.element.classes.has('bus-stop-marker-dimmed')
    ))).toBe(true)

    session.dispose()
    vi.unstubAllGlobals()
  })

  it('clears a route presentation when the selected route is missing from reloaded data', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const originalData = createTransitData()
    const replacementData = createTransitData('B1', '#654321')
    replacementData.geometry.features.push({
      type: 'Feature',
      properties: { routeId: 'B2', name: 'B2', color: '#abcdef' },
      geometry: { type: 'LineString', coordinates: [[104, 2], [104.1, 2.1]] },
    })
    const map = fakeMapState.maps.at(-1) as {
      fitBounds: ReturnType<typeof vi.fn>
      paintProperties: Map<string, unknown>
      addedMarkers: Array<{ element: FakeElement }>
    }

    await session.ready
    const selectedRoute = createRouteSelection(originalData)
    session.loadTransitData(originalData, selectedRoute)
    session.loadTransitData(replacementData, selectedRoute)

    expect(map.fitBounds).toHaveBeenCalledTimes(2)
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [[103, 1], [104.1, 2.1]],
      expect.objectContaining({ duration: 500 }),
    )

    expect(map.paintProperties.get('shuttle-route-lines:line-color')).toBe('#64748b')
    const reloadedMarkers = map.addedMarkers.slice(-replacementData.index.stops.length)
    expect(reloadedMarkers.every((marker) => !marker.element.classes.has('bus-stop-marker-selected')))
      .toBe(true)
    expect(reloadedMarkers.every((marker) => !marker.element.classes.has('bus-stop-marker-dimmed')))
      .toBe(true)

    session.dispose()
    vi.unstubAllGlobals()
  })

  it('fits the replacement route when the selected route changes during reload', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const firstData = createTransitData()
    const replacementData = createTransitData('B1', '#654321')
    const map = fakeMapState.maps.at(-1) as {
      fitBounds: ReturnType<typeof vi.fn>
    }

    await session.ready
    session.loadTransitData(firstData, createRouteSelection(firstData))
    session.loadTransitData(replacementData, createRouteSelection(replacementData))

    expect(map.fitBounds).toHaveBeenCalledTimes(2)
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [[103, 1], [103.1, 1.1]],
      expect.objectContaining({ duration: 500 }),
    )

    session.dispose()
    vi.unstubAllGlobals()
  })

  it('replaces and clears venue markers while flying to the selected venue', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const venueOne: VenueLocation = {
      roomName: 'Venue One',
      location: { x: 103.7, y: 1.3 },
    }
    const venueTwo: VenueLocation = {
      roomName: 'Venue Two',
      location: { x: 103.8, y: 1.4 },
    }
    const map = fakeMapState.maps.at(-1) as {
      addedMarkers: Array<{ coordinate: unknown; remove: ReturnType<typeof vi.fn> }>
      flyTo: ReturnType<typeof vi.fn>
    }

    await session.ready
    session.selectVenue(venueOne)
    expect(map.flyTo).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalledTimes(1))
    session.selectVenue(venueTwo)
    expect(map.flyTo).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalledTimes(2))

    expect(map.addedMarkers).toHaveLength(2)
    expect(map.addedMarkers[0].remove).toHaveBeenCalledOnce()
    expect(map.addedMarkers[1].remove).not.toHaveBeenCalled()
    expect(map.flyTo).toHaveBeenNthCalledWith(1, expect.objectContaining({
      center: [103.7, 1.3],
      zoom: 17,
      essential: true,
    }))
    session.setViewportInsets({ top: 88, right: 12, bottom: 196, left: 12 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(map.flyTo).toHaveBeenCalledTimes(2)
    expect(map.flyTo).toHaveBeenNthCalledWith(2, expect.objectContaining({
      center: [103.8, 1.4],
      zoom: 17,
      essential: true,
    }))

    session.clearVenue()
    session.clearVenue()

    expect(map.addedMarkers[1].remove).toHaveBeenCalledOnce()
    expect(map.flyTo).toHaveBeenCalledTimes(2)
    session.dispose()
    vi.unstubAllGlobals()
  })

  it('uses measured insets for route, endpoint, zoom, and reset camera actions', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const transitData = createTransitData()
    const map = fakeMapState.maps.at(-1) as {
      fitBounds: ReturnType<typeof vi.fn>
      flyTo: ReturnType<typeof vi.fn>
      zoomIn: ReturnType<typeof vi.fn>
      zoomOut: ReturnType<typeof vi.fn>
    }
    const insets = { top: 88, right: 12, bottom: 196, left: 12 }

    await session.ready
    session.setViewportInsets(insets)
    session.loadTransitData(transitData, { route: null, overlappingRouteIds: new Set() })
    session.setRouteSelection(createRouteSelection(transitData))
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [[103, 1], [103.1, 1.1]],
      expect.objectContaining({
        padding: { top: 88, right: 24, bottom: 196, left: 24 },
      }),
    )

    session.resetView({ kind: 'trip', coordinates: [[103, 1], [103.1, 1.1]] })
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [[103, 1], [103.1, 1.1]],
      expect.objectContaining({ padding: insets, maxZoom: 17 }),
    )
    session.resetView({ kind: 'trip', coordinates: [[103.2, 1.2]] })
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({
      center: [103.2, 1.2],
      zoom: 17,
      padding: insets,
    }))
    session.zoomIn()
    session.zoomOut()
    expect(map.zoomIn).toHaveBeenCalledWith({ duration: 200 })
    expect(map.zoomOut).toHaveBeenCalledWith({ duration: 200 })

    session.dispose()
    vi.unstubAllGlobals()
  })

  it('replaces endpoint markers from the current immutable transit index and clears them', async () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() })
    const session = createMapSession({
      container: {} as HTMLElement,
      onMapError: vi.fn(),
      onEmptyMapClick: vi.fn(),
    })
    const firstTransitData = createTransitData()
    const changedNetwork = createValidTransitNetwork()
    changedNetwork.stops[0].longitude = 104
    const secondIndex = createTransitIndex(changedNetwork)
    const request = {
      origin: { kind: 'stop' as const, id: 'STOP-A' },
      destination: { kind: 'venue' as const, id: 'VENUE-A' },
    }
    const venues = {
      'VENUE-A': {
        roomName: 'Venue A',
        location: { x: 103.9, y: 1.5 },
      },
    }
    const map = fakeMapState.maps.at(-1) as {
      addedMarkers: Array<{ coordinate: unknown; remove: ReturnType<typeof vi.fn> }>
    }

    await session.ready
    session.setTripRequest(request, venues, firstTransitData.index)
    session.loadTransitData(firstTransitData, {
      route: null,
      overlappingRouteIds: new Set(),
    })
    const initialEndpointMarkers = map.addedMarkers.slice(-2)
    expect(initialEndpointMarkers.map((marker) => marker.coordinate)).toEqual([
      [103, 1],
      [103.9, 1.5],
    ])

    session.loadTransitData({
      network: secondIndex.network,
      geometry: firstTransitData.geometry,
      index: secondIndex,
    }, {
      route: null,
      overlappingRouteIds: new Set(),
    })

    expect(initialEndpointMarkers[0].remove).toHaveBeenCalledOnce()
    expect(initialEndpointMarkers[1].remove).toHaveBeenCalledOnce()
    expect(map.addedMarkers.slice(-2).map((marker) => marker.coordinate)).toEqual([
      [104, 1],
      [103.9, 1.5],
    ])

    session.setTripRequest({ origin: null, destination: null }, venues, secondIndex)

    expect(map.addedMarkers.slice(-2).every((marker) => marker.remove.mock.calls.length === 1)).toBe(true)
    session.dispose()
    vi.unstubAllGlobals()
  })

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
      flyTo: ReturnType<typeof vi.fn>
      fitBounds: ReturnType<typeof vi.fn>
    }

    await session.ready
    session.setTripRequest(
      { origin: { kind: 'stop', id: 'STOP-A' }, destination: null },
      {},
      null,
    )
    session.loadTransitData(transitData, {
      route: null,
      overlappingRouteIds: new Set(),
    })
    session.loadTransitData(transitData, {
      route: null,
      overlappingRouteIds: new Set(),
    })
    expect(map.fitBounds).not.toHaveBeenCalled()

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
    const flyToCount = map.flyTo.mock.calls.length
    session.setRouteSelection({ route: null, overlappingRouteIds: new Set() })
    session.setTripRequest({ origin: null, destination: null }, {}, null)
    session.selectVenue({} as VenueLocation)
    session.clearVenue()
    expect(map.addedMarkers).toHaveLength(markerCount)
    expect(map.removedLayers).toHaveLength(removedLayerCount)
    expect(map.flyTo).toHaveBeenCalledTimes(flyToCount)
    session.loadTransitData(transitData, {
      route: null,
      overlappingRouteIds: new Set(),
    })

    vi.unstubAllGlobals()
  })
})

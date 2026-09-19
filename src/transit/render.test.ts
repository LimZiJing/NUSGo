import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map, Marker } from 'maplibre-gl'
import { addBusStopMarkers, setBusStopMarkerSelection } from '../map/markers'
import {
  addTransitRouteLayers,
  addValidatedBusStopMarkers,
  addValidatedTransitMapData,
  fitTransitRoute,
  getTransitRouteBounds,
  getTransitRouteFitPadding,
  removeTransitRouteLayers,
  setTransitRouteSelection,
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
  TRANSIT_ROUTE_SOURCE_ID,
  waitForMapStyleLoaded,
} from './render'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { TransitRouteGeometry } from '../domain/transit/types'
import { validateTransitMapData } from '../domain/transit/map-data'

vi.mock('../map/markers', () => ({
  addBusStopMarkers: vi.fn(() => []),
  setBusStopMarkerSelection: vi.fn((markers: Marker[], selectedStopIds: readonly string[] | null) => {
    const selectedIds = new Set(selectedStopIds ?? [])
    for (const marker of markers) {
      const element = marker.getElement()
      const isSelected = selectedIds.has(element.dataset.stopId ?? '')
      element.classList.toggle('bus-stop-marker-selected', selectedStopIds !== null && isSelected)
      element.classList.toggle('bus-stop-marker-hidden', selectedStopIds !== null && !isSelected)
      element.style.display = selectedStopIds === null || isSelected ? '' : 'none'
      const popup = marker.getPopup()
      if (selectedStopIds !== null && !isSelected && popup?.isOpen()) popup.remove()
    }
  }),
}))

function createValidGeometry(): TransitRouteGeometry {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: {
        type: 'LineString',
        coordinates: [[103, 1], [103.1, 1.1]],
      },
    }],
  }
}

interface FakeMapState {
  map: Map
  events: string[]
  sourceIds: Set<string>
  layerIds: Set<string>
  addedSources: unknown[]
  addedLayers: unknown[]
  removedSources: string[]
  removedLayers: string[]
  paintProperties: Array<{ name: string; value: unknown }>
  filters: Array<{ id: string; value: unknown }>
  fitBoundsCalls: Array<{ bounds: unknown; options: unknown }>
}

function createFakeMarker(
  stopId: string,
  popupIsOpen = false,
): {
  marker: Marker
  classes: Set<string>
  element: { style: { display: string; setProperty: ReturnType<typeof vi.fn> } }
  popup: { isOpen: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
} {
  const classes = new Set<string>()
  const popup = {
    isOpen: vi.fn(() => popupIsOpen),
    remove: vi.fn(),
  }
  const element = {
    dataset: { stopId },
    style: {
      display: '',
      setProperty: vi.fn(),
    },
    classList: {
      toggle(name: string, force: boolean) {
        if (force) classes.add(name)
        else classes.delete(name)
      },
    },
  }

  return {
    marker: {
      getElement: () => element,
      getPopup: () => popup,
    } as unknown as Marker,
    classes,
    element,
    popup,
  }
}

function createFakeMap(): FakeMapState {
  const state: FakeMapState = {
    map: undefined as unknown as Map,
    events: [],
    sourceIds: new Set<string>(),
    layerIds: new Set<string>(),
    addedSources: [],
    addedLayers: [],
    removedSources: [],
    removedLayers: [],
    paintProperties: [],
    filters: [],
    fitBoundsCalls: [],
  }

  state.map = {
    getSource: vi.fn((id: string) => state.sourceIds.has(id) ? {} : undefined),
    getLayer: vi.fn((id: string) => state.layerIds.has(id) ? {} : undefined),
    addSource: vi.fn((id: string, source: unknown) => {
      state.events.push('source')
      state.sourceIds.add(id)
      state.addedSources.push({ id, source })
    }),
    addLayer: vi.fn((layer: { id: string }) => {
      state.events.push('layer')
      state.layerIds.add(layer.id)
      state.addedLayers.push(layer)
    }),
    removeSource: vi.fn((id: string) => {
      state.removedSources.push(id)
      state.sourceIds.delete(id)
    }),
    removeLayer: vi.fn((id: string) => {
      state.removedLayers.push(id)
      state.layerIds.delete(id)
    }),
    setPaintProperty: vi.fn((_layerId: string, name: string, value: unknown) => {
      state.paintProperties.push({ name, value })
    }),
    setFilter: vi.fn((id: string, value: unknown) => {
      state.filters.push({ id, value })
    }),
    getContainer: vi.fn(() => ({ clientWidth: 1200 })),
    fitBounds: vi.fn((bounds: unknown, options: unknown) => {
      state.fitBoundsCalls.push({ bounds, options })
    }),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Map

  return state
}

describe('addValidatedBusStopMarkers', () => {
  const map = {} as Map

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not create markers when network validation fails', () => {
    const network = createValidTransitNetwork()
    network.routes[0].color = '#12345'

    expect(() => addValidatedBusStopMarkers(map, network)).toThrowError(
      /Transit route A1 has non-hex route color/,
    )
    expect(addBusStopMarkers).not.toHaveBeenCalled()
  })

  it('creates markers only after validation succeeds', () => {
    const network = createValidTransitNetwork()

    const result = addValidatedBusStopMarkers(map, network)

    expect(result.network).toBe(network)
    expect(result.markers).toEqual([])
    expect(addBusStopMarkers).toHaveBeenCalledOnce()
    expect(addBusStopMarkers).toHaveBeenCalledWith(map, network.stops)
  })
})

describe('validated transit map data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not create route layers or markers when geometry validation fails', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()
    geometry.features[0].geometry.coordinates = [[103, 1], [103, 1]]

    const state = createFakeMap()

    expect(() => addValidatedTransitMapData(state.map, network, geometry)).toThrowError(
      /route A1 stop STOP-B is .* metres from route geometry/,
    )
    expect(state.addedSources).toHaveLength(0)
    expect(state.addedLayers).toHaveLength(0)
    expect(addBusStopMarkers).not.toHaveBeenCalled()
  })

  it('validates both payloads before adding the map data', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()
    const state = createFakeMap()

    const result = addValidatedTransitMapData(state.map, network, geometry)

    expect(result.network).toBe(network)
    expect(result.geometry).toBe(geometry)
    expect(result.markers).toEqual([])
    expect(state.events).toEqual(['source', 'layer', 'layer', 'layer'])
    expect(addBusStopMarkers).toHaveBeenCalledWith(state.map, network.stops)
  })

  it('adds route layers only once and uses route properties for color', () => {
    const geometry = createValidGeometry()
    const state = createFakeMap()

    addTransitRouteLayers(state.map, geometry)
    addTransitRouteLayers(state.map, geometry)

    expect(state.addedSources).toHaveLength(1)
    expect(state.addedLayers).toHaveLength(3)
    expect(state.addedSources[0]).toEqual({
      id: TRANSIT_ROUTE_SOURCE_ID,
      source: { type: 'geojson', data: geometry },
    })
    expect(state.addedLayers.map((layer) => (layer as { id: string }).id)).toEqual([
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
    ])
    expect(state.addedLayers[1]).toMatchObject({
      id: TRANSIT_ROUTE_LAYER_ID,
      source: TRANSIT_ROUTE_SOURCE_ID,
      type: 'line',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#64748b',
      },
    })
    expect(state.addedLayers[2]).toMatchObject({
      id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      source: TRANSIT_ROUTE_SOURCE_ID,
      type: 'symbol',
      filter: ['==', ['get', 'routeId'], ''],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 80,
        'text-field': '▶',
      },
    })
  })

  it('removes the route layer before its source during cleanup', () => {
    const state = createFakeMap()
    state.sourceIds.add(TRANSIT_ROUTE_SOURCE_ID)
    state.layerIds.add(TRANSIT_ROUTE_CASING_LAYER_ID)
    state.layerIds.add(TRANSIT_ROUTE_LAYER_ID)
    state.layerIds.add(TRANSIT_ROUTE_DIRECTION_LAYER_ID)

    removeTransitRouteLayers(state.map)

    expect(state.removedLayers).toEqual([
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_CASING_LAYER_ID,
    ])
    expect(state.removedSources).toEqual([TRANSIT_ROUTE_SOURCE_ID])
  })

  it('validates the complete map data as a pure operation', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()

    expect(validateTransitMapData(network, geometry)).toEqual({ network, geometry })
  })

  it('dims unselected routes and restores the all-routes style', () => {
    const state = createFakeMap()
    state.layerIds.add(TRANSIT_ROUTE_LAYER_ID)

    setTransitRouteSelection(state.map, 'A1')

    expect(state.paintProperties[0]).toEqual({
      name: 'line-opacity',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], 1, 0.18],
    })
    expect(state.paintProperties[2].name).toBe('line-width')
    expect(state.paintProperties[2].value).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      12, ['case', ['==', ['get', 'routeId'], 'A1'], 3, 1.5],
      15, ['case', ['==', ['get', 'routeId'], 'A1'], 6, 3],
      18, ['case', ['==', ['get', 'routeId'], 'A1'], 8, 4.5],
    ])

    setTransitRouteSelection(state.map, null)

    expect(state.paintProperties.slice(-3)).toEqual([
      { name: 'line-color', value: '#64748b' },
      { name: 'line-opacity', value: 0.55 },
      {
        name: 'line-width',
        value: ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 18, 6],
      },
    ])
  })

  it('applies selection to every route layer and shows direction indicators', () => {
    const state = createFakeMap()
    state.layerIds.add(TRANSIT_ROUTE_CASING_LAYER_ID)
    state.layerIds.add(TRANSIT_ROUTE_LAYER_ID)
    state.layerIds.add(TRANSIT_ROUTE_DIRECTION_LAYER_ID)

    setTransitRouteSelection(state.map, 'A1')

    expect(state.paintProperties[0]).toEqual({
      name: 'line-opacity',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], 0.95, 0.45],
    })
    expect(state.paintProperties[3]).toEqual({
      name: 'line-color',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], ['get', 'color'], '#64748b'],
    })
    expect(state.filters).toEqual([{
      id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      value: ['==', ['get', 'routeId'], 'A1'],
    }])

    setTransitRouteSelection(state.map, null)

    expect(state.filters.at(-1)).toEqual({
      id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      value: ['==', ['get', 'routeId'], ''],
    })
  })

  it('hides irrelevant stops, closes their popup, and restores all markers', () => {
    const first = createFakeMarker('STOP-A')
    const second = createFakeMarker('STOP-B', true)

    setBusStopMarkerSelection([first.marker, second.marker], ['STOP-A'])

    expect(first.classes).toContain('bus-stop-marker-selected')
    expect(second.classes).not.toContain('bus-stop-marker-selected')
    expect(first.element.style.display).toBe('')
    expect(second.element.style.display).toBe('none')
    expect(second.popup.remove).toHaveBeenCalledOnce()

    setBusStopMarkerSelection([first.marker, second.marker], ['STOP-B'])

    expect(first.element.style.display).toBe('none')
    expect(second.element.style.display).toBe('')
    expect(second.classes).toContain('bus-stop-marker-selected')

    setBusStopMarkerSelection([first.marker, second.marker], null)

    expect(first.classes).not.toContain('bus-stop-marker-selected')
    expect(second.classes).not.toContain('bus-stop-marker-selected')
    expect(first.element.style.display).toBe('')
    expect(second.element.style.display).toBe('')
  })

  it('dims overlapping routes in both layers and restores the cleared state', () => {
    const state = createFakeMap()
    state.layerIds.add(TRANSIT_ROUTE_CASING_LAYER_ID)
    state.layerIds.add(TRANSIT_ROUTE_LAYER_ID)

    setTransitRouteSelection(state.map, 'A1', new Set(['A2']))

    const overlappingRouteMatch = [
      'in',
      ['get', 'routeId'],
      ['literal', ['A2']],
    ]
    expect(state.paintProperties[0]).toEqual({
      name: 'line-opacity',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], 0.95, ['case', overlappingRouteMatch, 0.04, 0.45]],
    })
    expect(state.paintProperties[2]).toEqual({
      name: 'line-opacity',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], 1, ['case', overlappingRouteMatch, 0.04, 0.18]],
    })

    setTransitRouteSelection(state.map, null)

    expect(state.paintProperties.slice(-5)).toEqual([
      { name: 'line-opacity', value: 0.35 },
      {
        name: 'line-width',
        value: ['interpolate', ['linear'], ['zoom'], 12, 4, 15, 6, 18, 8],
      },
      { name: 'line-color', value: '#64748b' },
      { name: 'line-opacity', value: 0.55 },
      {
        name: 'line-width',
        value: ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 18, 6],
      },
    ])
  })
})

describe('transit route camera', () => {
  it('builds selected route bounds from geometry and ordered stops', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()
    geometry.features[0].geometry.coordinates = [[102.9, 0.9], [103.2, 1.2]]

    expect(getTransitRouteBounds(createTransitIndex(network), geometry, 'A1')).toEqual([
      [102.9, 0.9],
      [103.2, 1.2],
    ])
  })

  it('uses all network bounds for cleared and unknown selections', () => {
    const network = createValidTransitNetwork()
    network.routes.push({
      id: 'B1',
      name: 'B1',
      color: '#654321',
      stopIds: ['STOP-B'],
    })
    const geometry = createValidGeometry()
    geometry.features.push({
      type: 'Feature',
      properties: { routeId: 'B1', name: 'B1', color: '#654321' },
      geometry: { type: 'LineString', coordinates: [[104, 2], [104.1, 2.1]] },
    })

    const allBounds = [[103, 1], [104.1, 2.1]]
    expect(getTransitRouteBounds(createTransitIndex(network), geometry, null)).toEqual(allBounds)
    expect(getTransitRouteBounds(createTransitIndex(network), geometry, 'UNKNOWN')).toEqual(allBounds)
  })

  it('uses overlay-aware responsive padding for route fitting', () => {
    expect(getTransitRouteFitPadding(1200)).toEqual({
      top: 112,
      right: 360,
      bottom: 64,
      left: 360,
    })
    expect(getTransitRouteFitPadding(600)).toEqual({
      top: 280,
      right: 24,
      bottom: 64,
      left: 24,
    })
  })

  it('fits the selected route with interruptible camera options', () => {
    const state = createFakeMap()
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()

    fitTransitRoute(state.map, createTransitIndex(network), geometry, 'A1')

    expect(state.fitBoundsCalls).toEqual([{
      bounds: [[103, 1], [103.1, 1.1]],
      options: {
        duration: 500,
        maxZoom: 16,
        padding: { top: 112, right: 360, bottom: 64, left: 360 },
      },
    }])
  })
})

describe('waitForMapStyleLoaded', () => {
  it('resolves immediately when the style is already loaded', async () => {
    const state = createFakeMap()

    await expect(waitForMapStyleLoaded(state.map, new AbortController().signal)).resolves.toBeUndefined()
    expect(state.map.once).not.toHaveBeenCalled()
  })

  it('resolves after the map load event', async () => {
    let loadHandler: (() => void) | undefined
    const state = createFakeMap()
    vi.mocked(state.map.isStyleLoaded).mockReturnValue(false)
    vi.mocked(state.map.once).mockImplementation((_event, handler) => {
      loadHandler = handler as unknown as () => void
      return state.map
    })

    const pending = waitForMapStyleLoaded(state.map, new AbortController().signal)
    loadHandler?.()

    await expect(pending).resolves.toBeUndefined()
    expect(state.map.off).toHaveBeenCalledWith('load', loadHandler)
  })
})

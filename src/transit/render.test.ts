import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { addBusStopMarkers } from '../map/markers'
import {
  addTransitRouteLayers,
  addValidatedBusStopMarkers,
  addValidatedTransitMapData,
  removeTransitRouteLayers,
  TRANSIT_ROUTE_LAYER_ID,
  TRANSIT_ROUTE_SOURCE_ID,
  validateTransitMapData,
  waitForMapStyleLoaded,
} from './render'
import { createValidTransitNetwork } from './test-fixtures'
import type { TransitRouteGeometry } from '../types/transit'

vi.mock('../map/markers', () => ({
  addBusStopMarkers: vi.fn(() => []),
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
    expect(state.events).toEqual(['source', 'layer'])
    expect(addBusStopMarkers).toHaveBeenCalledWith(state.map, network.stops)
  })

  it('adds route layers only once and uses route properties for color', () => {
    const geometry = createValidGeometry()
    const state = createFakeMap()

    addTransitRouteLayers(state.map, geometry)
    addTransitRouteLayers(state.map, geometry)

    expect(state.addedSources).toHaveLength(1)
    expect(state.addedLayers).toHaveLength(1)
    expect(state.addedSources[0]).toEqual({
      id: TRANSIT_ROUTE_SOURCE_ID,
      source: { type: 'geojson', data: geometry },
    })
    expect(state.addedLayers[0]).toMatchObject({
      id: TRANSIT_ROUTE_LAYER_ID,
      source: TRANSIT_ROUTE_SOURCE_ID,
      type: 'line',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
      },
    })
  })

  it('removes the route layer before its source during cleanup', () => {
    const state = createFakeMap()
    state.sourceIds.add(TRANSIT_ROUTE_SOURCE_ID)
    state.layerIds.add(TRANSIT_ROUTE_LAYER_ID)

    removeTransitRouteLayers(state.map)

    expect(state.removedLayers).toEqual([TRANSIT_ROUTE_LAYER_ID])
    expect(state.removedSources).toEqual([TRANSIT_ROUTE_SOURCE_ID])
  })

  it('validates the complete map data as a pure operation', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()

    expect(validateTransitMapData(network, geometry)).toEqual({ network, geometry })
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

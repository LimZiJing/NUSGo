import { describe, expect, it, vi } from 'vitest'
import type { Map, Marker } from 'maplibre-gl'
import { setBusStopMarkerSelection } from './shuttle-stops'
import {
  createTransitRouteLayers,
  getTransitRouteBounds,
  getTransitRouteFitPadding,
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
  TRANSIT_ROUTE_SOURCE_ID,
} from './transit'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { TransitRouteGeometry } from '../../domain/transit/types'

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
  } as unknown as Map

  return state
}

describe('transit route layer adapter', () => {
  it('installs each route layer once and removes owned objects idempotently', () => {
    const geometry = createValidGeometry()
    const state = createFakeMap()
    const first = createTransitRouteLayers(state.map, geometry)
    const second = createTransitRouteLayers(state.map, geometry)

    expect(state.addedSources).toHaveLength(1)
    expect(state.addedLayers.map((layer) => (layer as { id: string }).id)).toEqual([
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
    ])
    expect(state.addedSources[0]).toEqual({
      id: TRANSIT_ROUTE_SOURCE_ID,
      source: { type: 'geojson', data: geometry },
    })

    first.dispose()
    first.dispose()
    second.dispose()
    expect(state.removedLayers).toEqual([
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_CASING_LAYER_ID,
    ])
    expect(state.removedSources).toEqual([TRANSIT_ROUTE_SOURCE_ID])
  })

  it('dims unselected and overlapping routes, then restores all-routes presentation', () => {
    const state = createFakeMap()
    const layers = createTransitRouteLayers(state.map, createValidGeometry())

    layers.setSelection('A1', new Set(['A2']))

    expect(state.paintProperties[0]).toEqual({
      name: 'line-opacity',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], 0.95, [
        'case',
        ['in', ['get', 'routeId'], ['literal', ['A2']]],
        0.04,
        0.45,
      ]],
    })
    expect(state.paintProperties[3]).toEqual({
      name: 'line-color',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], ['get', 'color'], '#64748b'],
    })
    expect(state.filters.at(-1)).toEqual({
      id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      value: ['==', ['get', 'routeId'], 'A1'],
    })

    layers.setSelection(null)

    expect(state.paintProperties.slice(-3)).toEqual([
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
  it('builds selected route bounds from geometry and indexed stops', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()
    geometry.features[0].geometry.coordinates = [[102.9, 0.9], [103.2, 1.2]]

    expect(getTransitRouteBounds(createTransitIndex(network), geometry, 'A1')).toEqual([
      [102.9, 0.9],
      [103.2, 1.2],
    ])
  })

  it('uses all network bounds for a cleared or unknown selection', () => {
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
    const index = createTransitIndex(network)
    expect(getTransitRouteBounds(index, geometry, null)).toEqual(allBounds)
    expect(getTransitRouteBounds(index, geometry, 'UNKNOWN')).toEqual(allBounds)
  })

  it('uses overlay-aware responsive padding and fits with bounded animation', () => {
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

    const state = createFakeMap()
    const geometry = createValidGeometry()
    const layers = createTransitRouteLayers(state.map, geometry)
    layers.fitRoute(createTransitIndex(createValidTransitNetwork()), geometry, 'A1')

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

describe('fallback shuttle-stop presentation', () => {
  it('hides irrelevant stops, closes their popup, and restores all markers', () => {
    const classes = new Set<string>()
    const first = {
      getElement: () => ({
        dataset: { stopId: 'STOP-A' },
        classList: { toggle: (name: string, force: boolean) => force ? classes.add(name) : classes.delete(name) },
        style: { display: '', setProperty: vi.fn() },
      }),
      getPopup: () => null,
    }
    const popup = { isOpen: vi.fn(() => true), remove: vi.fn() }
    const second = {
      getElement: () => ({
        dataset: { stopId: 'STOP-B' },
        classList: { toggle: vi.fn() },
        style: { display: '', setProperty: vi.fn() },
      }),
      getPopup: () => popup,
    }

    setBusStopMarkerSelection([first, second] as unknown as Marker[], ['STOP-A'])

    expect(classes).toContain('bus-stop-marker-selected')
    expect(popup.remove).toHaveBeenCalledOnce()
  })
})

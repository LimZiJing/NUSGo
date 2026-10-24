import { describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  createTransitRouteLayers,
  getTransitRouteBounds,
  getTransitRouteFitPadding,
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
  TRANSIT_ROUTE_SOURCE_ID,
} from './transit'
import { createDirectionChevronImage } from './route-lanes'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { BusRouteGeometry } from '@nusgo/shared/transit/types'

function createValidGeometry(): BusRouteGeometry {
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
  layoutProperties: Array<{ id: string; name: string; value: unknown }>
  imageIds: Set<string>
  removedImages: string[]
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
    layoutProperties: [],
    imageIds: new Set<string>(),
    removedImages: [],
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
    setLayoutProperty: vi.fn((id: string, name: string, value: unknown) => {
      state.layoutProperties.push({ id, name, value })
    }),
    hasImage: vi.fn((id: string) => state.imageIds.has(id)),
    addImage: vi.fn((id: string) => {
      state.imageIds.add(id)
    }),
    removeImage: vi.fn((id: string) => {
      state.removedImages.push(id)
      state.imageIds.delete(id)
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
    expect(state.removedImages).toEqual(['shuttle-route-direction-chevron'])
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
    expect(state.paintProperties[4]).toEqual({
      name: 'line-color',
      value: ['case', ['==', ['get', 'routeId'], 'A1'], ['get', 'color'], '#64748b'],
    })
    expect(state.filters.at(-1)).toEqual({
      id: TRANSIT_ROUTE_DIRECTION_LAYER_ID,
      value: ['==', ['get', 'routeId'], 'A1'],
    })

    layers.setSelection(null)

    expect(state.paintProperties.filter(({ name }) => name === 'line-offset').slice(-2)).toEqual([
      { name: 'line-offset', value: 0 },
      { name: 'line-offset', value: 0 },
    ])

    expect(state.paintProperties.slice(-3)).toEqual([
      { name: 'line-color', value: '#64748b' },
      { name: 'line-opacity', value: 0.55 },
      {
        name: 'line-width',
        value: ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 18, 6],
      },
    ])
  })

  it('offsets only the selected route into a left-hand lane so doubled-back legs separate', () => {
    const state = createFakeMap()
    const layers = createTransitRouteLayers(state.map, createValidGeometry())

    layers.setSelection('D2')

    const routeMatch = ['==', ['get', 'routeId'], 'D2']
    const laneOffset = [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, ['case', routeMatch, -1.75, 0],
      15, ['case', routeMatch, -2.75, 0],
      18, ['case', routeMatch, -3.5, 0],
    ]
    expect(state.paintProperties.filter(({ name }) => name === 'line-offset')).toEqual([
      { name: 'line-offset', value: laneOffset },
      { name: 'line-offset', value: laneOffset },
    ])

    const directionLayer = state.addedLayers.find(
      (layer) => (layer as { id: string }).id === TRANSIT_ROUTE_DIRECTION_LAYER_ID,
    ) as { type: string; paint: Record<string, unknown> }
    expect(directionLayer.type).toBe('line')
    expect(directionLayer.paint['line-pattern']).toBe('shuttle-route-direction-chevron')
    expect(directionLayer.paint['line-offset']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      12, -1.75,
      15, -2.75,
      18, -3.5,
    ])
    expect(directionLayer.paint['line-width']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 3.5,
      15, 5.5,
      18, 7,
    ])
  })

  it('draws a chevron that points along the line direction', () => {
    const { width, height, data } = createDirectionChevronImage()
    const rightmostOpaqueX = (y: number) => {
      for (let x = width - 1; x >= 0; x -= 1) {
        if (data[(y * width + x) * 4 + 3] > 0) return x
      }
      return -1
    }

    expect(data).toHaveLength(width * height * 4)
    expect(rightmostOpaqueX(height / 2)).toBeGreaterThan(rightmostOpaqueX(0))
    expect(rightmostOpaqueX(height / 2)).toBeGreaterThan(rightmostOpaqueX(height - 1))
  })

  it('hides full-network layers during a Journey and restores the latest route selection', () => {
    const state = createFakeMap()
    const layers = createTransitRouteLayers(state.map, createValidGeometry())

    layers.setSelection('A1')
    layers.setJourneyActive(true)
    layers.setSelection('B1')

    expect(state.layoutProperties.slice(-3)).toEqual([
      { id: TRANSIT_ROUTE_CASING_LAYER_ID, name: 'visibility', value: 'none' },
      { id: TRANSIT_ROUTE_LAYER_ID, name: 'visibility', value: 'none' },
      { id: TRANSIT_ROUTE_DIRECTION_LAYER_ID, name: 'visibility', value: 'none' },
    ])

    layers.setJourneyActive(false)

    expect(state.layoutProperties.slice(-3)).toEqual([
      { id: TRANSIT_ROUTE_CASING_LAYER_ID, name: 'visibility', value: 'visible' },
      { id: TRANSIT_ROUTE_LAYER_ID, name: 'visibility', value: 'visible' },
      { id: TRANSIT_ROUTE_DIRECTION_LAYER_ID, name: 'visibility', value: 'visible' },
    ])
    expect(state.paintProperties.at(-3)).toEqual({
      name: 'line-color',
      value: ['case', ['==', ['get', 'routeId'], 'B1'], ['get', 'color'], '#64748b'],
    })
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
    expect(getTransitRouteFitPadding(768)).toEqual({
      top: 280,
      right: 24,
      bottom: 64,
      left: 24,
    })
    expect(getTransitRouteFitPadding(769)).toEqual({
      top: 112,
      right: 231,
      bottom: 64,
      left: 231,
    })
    expect(getTransitRouteFitPadding(390, {
      top: 88,
      right: 12,
      bottom: 196,
      left: 12,
    })).toEqual({
      top: 88,
      right: 24,
      bottom: 196,
      left: 24,
    })
    expect(getTransitRouteFitPadding(568, {
      top: 84,
      right: 12,
      bottom: 162,
      left: 12,
    })).toEqual({
      top: 84,
      right: 24,
      bottom: 162,
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

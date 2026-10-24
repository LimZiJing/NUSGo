import { describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import {
  applyBasemapPresentation,
  BASEMAP_LOCAL_POI_LAYER_ID,
  BASEMAP_LOW_PRIORITY_POI_LAYER_ID,
  BASEMAP_TRANSIT_POI_FILTER,
  BASEMAP_TRANSIT_POI_LAYER_ID,
} from './basemap'

function createFakeMap() {
  const layers = new Set([
    BASEMAP_TRANSIT_POI_LAYER_ID,
    BASEMAP_LOW_PRIORITY_POI_LAYER_ID,
    BASEMAP_LOCAL_POI_LAYER_ID,
  ])
  return {
    getLayer: vi.fn((id: string) => layers.has(id) ? {} : undefined),
    getFilter: vi.fn(() => ['>=', ['get', 'rank'], 1]),
    setFilter: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  }
}

describe('applyBasemapPresentation', () => {
  it('suppresses bus labels while retaining rail and airport transit context', () => {
    const map = createFakeMap()

    applyBasemapPresentation(map as unknown as Map)

    expect(map.setFilter).toHaveBeenCalledWith(
      BASEMAP_TRANSIT_POI_LAYER_ID,
      BASEMAP_TRANSIT_POI_FILTER,
    )
  })

  it('hides the lowest-priority POIs and dims local POIs', () => {
    const map = createFakeMap()

    applyBasemapPresentation(map as unknown as Map)

    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      BASEMAP_LOW_PRIORITY_POI_LAYER_ID,
      'visibility',
      'none',
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      BASEMAP_LOCAL_POI_LAYER_ID,
      'icon-opacity',
      0.55,
    )
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      BASEMAP_LOCAL_POI_LAYER_ID,
      'text-opacity',
      0.62,
    )
  })

  it('hides road shields and one-way arrows', () => {
    const map = createFakeMap()
    map.getLayer.mockReturnValue({})

    applyBasemapPresentation(map as unknown as Map)

    for (const layerId of ['highway-shield-non-us', 'road_shield_us', 'road_one_way_arrow']) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(layerId, 'visibility', 'none')
    }
  })

  it('skips optional basemap layers when the style does not provide them', () => {
    const map = createFakeMap()
    map.getLayer.mockReturnValue(undefined)

    expect(() => applyBasemapPresentation(map as unknown as Map)).not.toThrow()
    expect(map.setFilter).not.toHaveBeenCalled()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    expect(map.setPaintProperty).not.toHaveBeenCalled()
  })
})

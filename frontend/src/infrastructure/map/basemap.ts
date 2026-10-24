import type { FilterSpecification, Map } from 'maplibre-gl'

export const BASEMAP_TRANSIT_POI_LAYER_ID = 'poi_transit'
export const BASEMAP_LOW_PRIORITY_POI_LAYER_ID = 'poi_r20'
export const BASEMAP_LOCAL_POI_LAYER_ID = 'poi_r7'

const BASEMAP_RANKED_POI_LAYER_IDS = [
  'poi_r1',
  BASEMAP_LOCAL_POI_LAYER_ID,
  BASEMAP_LOW_PRIORITY_POI_LAYER_ID,
]

export const BASEMAP_TRANSIT_POI_FILTER: FilterSpecification = [
  'match',
  ['get', 'class'],
  ['airport', 'rail'],
  true,
  false,
]

const BASEMAP_NON_BUS_FILTER: FilterSpecification = [
  '!=',
  ['get', 'class'],
  'bus',
]

// Road shields and one-way arrows add clutter without helping campus orientation.
const BASEMAP_HIDDEN_LAYER_IDS = [
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
  'road_one_way_arrow',
  'road_one_way_arrow_opposite',
]

/**
 * Keep the OpenFreeMap Liberty style useful for campus orientation without
 * allowing duplicate bus labels and low-priority POIs to dominate the map.
 */
export function applyBasemapPresentation(map: Map): void {
  for (const layerId of BASEMAP_HIDDEN_LAYER_IDS) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none')
  }

  if (map.getLayer(BASEMAP_TRANSIT_POI_LAYER_ID)) {
    map.setFilter(BASEMAP_TRANSIT_POI_LAYER_ID, BASEMAP_TRANSIT_POI_FILTER)
  }

  for (const layerId of BASEMAP_RANKED_POI_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue
    const existingFilter = map.getFilter(layerId)
    map.setFilter(
      layerId,
      existingFilter
        ? ['all', BASEMAP_NON_BUS_FILTER, existingFilter] as FilterSpecification
        : BASEMAP_NON_BUS_FILTER,
    )
  }

  if (map.getLayer(BASEMAP_LOW_PRIORITY_POI_LAYER_ID)) {
    map.setLayoutProperty(BASEMAP_LOW_PRIORITY_POI_LAYER_ID, 'visibility', 'none')
  }

  if (map.getLayer(BASEMAP_LOCAL_POI_LAYER_ID)) {
    map.setPaintProperty(BASEMAP_LOCAL_POI_LAYER_ID, 'icon-opacity', 0.55)
    map.setPaintProperty(BASEMAP_LOCAL_POI_LAYER_ID, 'text-opacity', 0.62)
  }
}

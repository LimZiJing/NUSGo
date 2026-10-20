import type { GeoJSONSource, Map, SymbolLayerSpecification } from 'maplibre-gl'
import type { BuildingEntry } from '../../domain/venue/building-index'
import { formatBlockLabel } from '../../domain/venue/building-index'

export const BLOCK_LABEL_MIN_ZOOM = 17
export const BLOCK_LABEL_SOURCE_ID = 'building-block-labels'
export const BLOCK_LABEL_LAYER_ID = 'building-block-label-layer'

type BlockLabelFeature = {
  type: 'Feature'
  properties: {
    label: string
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}

export type BlockLabelGeoJson = {
  type: 'FeatureCollection'
  features: BlockLabelFeature[]
}

export interface BlockLabels {
  dispose(): void
}

export const BLOCK_NUMBER_MIN_ZOOM = 18
export const BLOCK_NUMBER_SOURCE_ID = 'building-block-numbers'
export const BLOCK_NUMBER_LAYER_ID = 'building-block-number-layer'
export const GROUP_LABEL_MIN_ZOOM = 15
export const GROUP_LABEL_SOURCE_ID = 'building-group-labels'
export const GROUP_LABEL_LAYER_ID = 'building-group-label-layer'

// Below the block-label zoom, a group shows only its name; at BLOCK_LABEL_MIN_ZOOM the block ranges take over.
const GROUP_LABEL_LAYER: SymbolLayerSpecification = {
  id: GROUP_LABEL_LAYER_ID,
  type: 'symbol',
  source: GROUP_LABEL_SOURCE_ID,
  minzoom: GROUP_LABEL_MIN_ZOOM,
  maxzoom: BLOCK_LABEL_MIN_ZOOM,
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#0f172a',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
}

const BLOCK_NUMBER_LAYER: SymbolLayerSpecification = {
  id: BLOCK_NUMBER_LAYER_ID,
  type: 'symbol',
  source: BLOCK_NUMBER_SOURCE_ID,
  minzoom: BLOCK_NUMBER_MIN_ZOOM,
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 13,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#0f172a',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
}

const BLOCK_LABEL_LAYER: SymbolLayerSpecification = {
  id: BLOCK_LABEL_LAYER_ID,
  type: 'symbol',
  source: BLOCK_LABEL_SOURCE_ID,
  minzoom: BLOCK_LABEL_MIN_ZOOM,
  // From BLOCK_NUMBER_MIN_ZOOM the per-block numbers take over from the building's range.
  maxzoom: BLOCK_NUMBER_MIN_ZOOM,
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#0f172a',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
}

// "Blocks 15-17" -> "15-17"; "Block 5" -> "5".
function toBlockRangeText(blocks: readonly string[]): string | undefined {
  return formatBlockLabel(blocks)?.replace(/^Blocks? /, '')
}

/** One point per navigable building that has block numbers; the label is the block range. */
export function createBlockLabelGeoJson(entries: readonly BuildingEntry[]): BlockLabelGeoJson {
  return {
    type: 'FeatureCollection',
    features: entries.flatMap((entry) => entry.buildings.flatMap((building) => {
      const blocks = building.blocks ?? []
      const label = toBlockRangeText(blocks)
      const { x, y } = building.location
      if (label === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return []
      return [{
        type: 'Feature' as const,
        properties: { label },
        geometry: { type: 'Point' as const, coordinates: [x, y] as [number, number] },
      }]
    })),
  }
}

/**
 * One point per block position: each block at its own recorded location, with blocks that share a
 * point (or have none recorded) grouped under the building's location as one range.
 */
export function createBlockNumberGeoJson(entries: readonly BuildingEntry[]): BlockLabelGeoJson {
  const features: BlockLabelFeature[] = []
  for (const entry of entries) {
    for (const building of entry.buildings) {
      const blocks = building.blocks ?? []
      if (blocks.length === 0) continue
      const atPoint: globalThis.Map<string, { point: { x: number; y: number }; blocks: string[] }> = new globalThis.Map()
      for (const block of blocks) {
        const point = building.blockLocations?.[block] ?? building.location
        const key = `${point.x},${point.y}`
        const group = atPoint.get(key) ?? { point, blocks: [] as string[] }
        group.blocks.push(block)
        atPoint.set(key, group)
      }
      for (const { point, blocks: grouped } of atPoint.values()) {
        const label = toBlockRangeText(grouped)
        if (label === undefined || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
        features.push({
          type: 'Feature',
          properties: { label },
          geometry: { type: 'Point', coordinates: [point.x, point.y] },
        })
      }
    }
  }
  return { type: 'FeatureCollection', features }
}

/** Same lifecycle as installBlockLabels, for the per-block number layer. */
export function installBlockNumbers(map: Map, geoJson: BlockLabelGeoJson): BlockLabels {
  return installLabelLayer(map, BLOCK_NUMBER_SOURCE_ID, BLOCK_NUMBER_LAYER, geoJson)
}

function installLabelLayer(
  map: Map,
  sourceId: string,
  layer: SymbolLayerSpecification,
  geoJson: BlockLabelGeoJson,
): BlockLabels {
  const ownsSource = !map.getSource(sourceId)
  const ownsLayer = !map.getLayer(layer.id)

  if (ownsSource) {
    map.addSource(sourceId, { type: 'geojson', data: geoJson })
  } else {
    (map.getSource(sourceId) as GeoJSONSource).setData(geoJson)
  }
  if (ownsLayer) map.addLayer(layer)

  return {
    dispose() {
      if (ownsLayer && map.getLayer(layer.id)) map.removeLayer(layer.id)
      if (ownsSource && map.getSource(sourceId)) map.removeSource(sourceId)
    },
  }
}

/**
 * Adds the block-label source and layer, or replaces the data when they already exist.
 * The returned handle removes only what this call added.
 */
export function installBlockLabels(map: Map, geoJson: BlockLabelGeoJson): BlockLabels {
  return installLabelLayer(map, BLOCK_LABEL_SOURCE_ID, BLOCK_LABEL_LAYER, geoJson)
}

/** One point per group of several buildings, labelled with the group name. */
export function createGroupLabelGeoJson(entries: readonly BuildingEntry[]): BlockLabelGeoJson {
  return {
    type: 'FeatureCollection',
    features: entries.flatMap((entry) => {
      const { x, y } = entry.location
      if (entry.buildings.length < 2 || !Number.isFinite(x) || !Number.isFinite(y)) return []
      return [{
        type: 'Feature' as const,
        properties: { label: entry.name },
        geometry: { type: 'Point' as const, coordinates: [x, y] as [number, number] },
      }]
    }),
  }
}

/** Same lifecycle as installBlockLabels, for the group-name layer. */
export function installGroupLabels(map: Map, geoJson: BlockLabelGeoJson): BlockLabels {
  return installLabelLayer(map, GROUP_LABEL_SOURCE_ID, GROUP_LABEL_LAYER, geoJson)
}

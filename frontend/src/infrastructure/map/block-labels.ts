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

const BLOCK_LABEL_LAYER: SymbolLayerSpecification = {
  id: BLOCK_LABEL_LAYER_ID,
  type: 'symbol',
  source: BLOCK_LABEL_SOURCE_ID,
  minzoom: BLOCK_LABEL_MIN_ZOOM,
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
 * Adds the block-label source and layer, or replaces the data when they already exist.
 * The returned handle removes only what this call added.
 */
export function installBlockLabels(map: Map, geoJson: BlockLabelGeoJson): BlockLabels {
  const ownsSource = !map.getSource(BLOCK_LABEL_SOURCE_ID)
  const ownsLayer = !map.getLayer(BLOCK_LABEL_LAYER_ID)

  if (ownsSource) {
    map.addSource(BLOCK_LABEL_SOURCE_ID, { type: 'geojson', data: geoJson })
  } else {
    (map.getSource(BLOCK_LABEL_SOURCE_ID) as GeoJSONSource).setData(geoJson)
  }
  if (ownsLayer) map.addLayer(BLOCK_LABEL_LAYER)

  return {
    dispose() {
      if (ownsLayer && map.getLayer(BLOCK_LABEL_LAYER_ID)) map.removeLayer(BLOCK_LABEL_LAYER_ID)
      if (ownsSource && map.getSource(BLOCK_LABEL_SOURCE_ID)) map.removeSource(BLOCK_LABEL_SOURCE_ID)
    },
  }
}
